package com.eliezer.ruleengine.rule.compiler;

import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.rule.model.ConditionNode;
import com.eliezer.ruleengine.rule.model.GroupNode;
import com.eliezer.ruleengine.rule.model.RuleNode;
import com.eliezer.ruleengine.rule.model.UnaryConditionNode;
import com.eliezer.ruleengine.rule.model.value.StringValue;
import com.eliezer.ruleengine.rule.validation.RuleTreeValidator;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Compiles a validated {@link RuleNode} tree into a {@link Specification}, i.e. into SQL.
 *
 * <p>Compiling rather than evaluating in memory is the load-bearing decision here: an
 * interpreter walking every Person row cannot use an index, cannot paginate at the database,
 * and degrades linearly with the population size. Everything below exists to make the
 * translation safe — the tree arrives from outside the process and is not trusted.
 *
 * <p>Three guardrails, in order:
 * <ol>
 *   <li>{@link RuleTreeValidator} bounds depth, node count and IN-list size before any traversal.</li>
 *   <li>{@link FieldRegistry} maps a logical field name onto an attribute path; unregistered
 *       names never become paths, so no caller-supplied string reaches the query as an identifier.</li>
 *   <li>Every operand becomes a bound parameter via the Criteria API, and LIKE patterns are
 *       escaped explicitly.</li>
 * </ol>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RuleCompiler {

    private static final char LIKE_ESCAPE = '\\';

    private final RuleTreeValidator validator;

    /**
     * @param registry allow-list for the query root
     * @param root     the AST to compile
     */
    public <T> Specification<T> compile(FieldRegistry<T> registry, RuleNode root) {
        validator.validate(root);
        return (queryRoot, query, cb) -> {
            CompilationContext<T> ctx = new CompilationContext<>(registry, queryRoot, cb);
            Predicate predicate = ctx.compile(root);

            // A join across a to-many association multiplies the root rows. Without DISTINCT a
            // person linked to three matching cases comes back three times, which also corrupts
            // page counts. Applied only when a join was actually created.
            if (ctx.joinedToMany && query != null) {
                query.distinct(true);
            }
            return predicate;
        };
    }

    /**
     * Per-query mutable state. Kept out of the bean itself so the compiler stays stateless and
     * therefore safe to share across concurrent requests.
     */
    private static final class CompilationContext<T> {

        private final FieldRegistry<T> registry;
        private final Root<T> root;
        private final CriteriaBuilder cb;
        private final Map<String, From<?, ?>> joins = new HashMap<>();
        private boolean joinedToMany;

        private CompilationContext(FieldRegistry<T> registry, Root<T> root, CriteriaBuilder cb) {
            this.registry = registry;
            this.root = root;
            this.cb = cb;
        }

        private Predicate compile(RuleNode node) {
            return switch (node) {
                case GroupNode group -> compileGroup(group);
                case ConditionNode condition -> compileCondition(condition);
                case UnaryConditionNode unary -> compileUnary(unary);
            };
        }

        private Predicate compileGroup(GroupNode group) {
            List<Predicate> children = new ArrayList<>(group.children().size());
            for (RuleNode child : group.children()) {
                children.add(compile(child));
            }
            return switch (group.operator()) {
                case AND -> cb.and(children.toArray(Predicate[]::new));
                case OR -> cb.or(children.toArray(Predicate[]::new));
                // Arity is already guaranteed to be 1 by GroupNode's compact constructor.
                case NOT -> cb.not(children.getFirst());
            };
        }

        private Predicate compileUnary(UnaryConditionNode node) {
            Path<?> path = resolve(registry.require(node.field()));
            return switch (node.operator()) {
                case IS_NULL -> cb.isNull(path);
                case IS_NOT_NULL -> cb.isNotNull(path);
            };
        }

        private Predicate compileCondition(ConditionNode node) {
            FieldDescriptor descriptor = registry.require(node.field());
            descriptor.requireCompatible(node.operator());
            Path<?> path = resolve(descriptor);

            return switch (node.operator()) {
                case EQUALS -> cb.equal(path, descriptor.coerce(node.value()));

                // NOT_EQUALS on a nullable column: SQL three-valued logic drops NULL rows from
                // `col <> x`, which almost never matches a rule author's intent. OR-ing IS NULL
                // makes "not equal to HIGH" include persons with no risk recorded.
                case NOT_EQUALS -> cb.or(
                        cb.notEqual(path, descriptor.coerce(node.value())),
                        cb.isNull(path));

                case CONTAINS -> likeIgnoreCase(path, "%" + escapeLike(text(node)) + "%");
                case STARTS_WITH -> likeIgnoreCase(path, escapeLike(text(node)) + "%");
                case ENDS_WITH -> likeIgnoreCase(path, "%" + escapeLike(text(node)));

                case BETWEEN -> {
                    List<?> bounds = (List<?>) descriptor.coerce(node.value());
                    yield cb.between(
                            comparablePath(path),
                            comparableValue(bounds.getFirst()),
                            comparableValue(bounds.getLast()));
                }

                case GT -> cb.greaterThan(
                        comparablePath(path), comparableValue(descriptor.coerce(node.value())));
                case GTE -> cb.greaterThanOrEqualTo(
                        comparablePath(path), comparableValue(descriptor.coerce(node.value())));
                case LT -> cb.lessThan(
                        comparablePath(path), comparableValue(descriptor.coerce(node.value())));
                case LTE -> cb.lessThanOrEqualTo(
                        comparablePath(path), comparableValue(descriptor.coerce(node.value())));

                case IN -> path.in((List<?>) descriptor.coerce(node.value()));
                case NOT_IN -> cb.or(
                        cb.not(path.in((List<?>) descriptor.coerce(node.value()))),
                        cb.isNull(path));
            };
        }

        /**
         * Positions the base path, creating (and memoising) joins as needed. Reuse matters: two
         * conditions on {@code case.status} and {@code case.title} must share one join, otherwise
         * they silently start meaning "some case is OPEN and some other case is titled X".
         */
        private Path<?> resolve(FieldDescriptor descriptor) {
            if (!descriptor.requiresJoin()) {
                return descriptor.resolveFrom(root);
            }
            From<?, ?> base = root;
            StringBuilder key = new StringBuilder();
            for (String segment : descriptor.joinSegments()) {
                key.append(segment).append('.');
                From<?, ?> resolved = joins.get(key.toString());
                if (resolved == null) {
                    resolved = base.join(segment, JoinType.INNER);
                    joins.put(key.toString(), resolved);
                    joinedToMany = true;
                }
                base = resolved;
            }
            return descriptor.resolveFrom(base);
        }

        private Predicate likeIgnoreCase(Path<?> path, String pattern) {
            @SuppressWarnings("unchecked")
            Expression<String> textPath = (Expression<String>) path;
            return cb.like(cb.lower(textPath), pattern.toLowerCase(), LIKE_ESCAPE);
        }

        private String text(ConditionNode node) {
            if (node.value() instanceof StringValue s) {
                return s.value();
            }
            throw new RuleValidationException(
                    "Operator %s requires a STRING operand".formatted(node.operator()));
        }

        /**
         * Ordering comparisons are erased to {@code Comparable<Object>} rather than to an inferred
         * type variable: with an inferred one, {@code cb.greaterThan(expr, value)} matches both the
         * {@code (Expression, Y)} and {@code (Expression, Expression)} overloads and the call is
         * ambiguous. The descriptor has already coerced the operand to the attribute's own type.
         */
        @SuppressWarnings("unchecked")
        private Expression<Comparable<Object>> comparablePath(Path<?> path) {
            return (Expression<Comparable<Object>>) path;
        }

        @SuppressWarnings("unchecked")
        private Comparable<Object> comparableValue(Object value) {
            return (Comparable<Object>) value;
        }
    }

    /**
     * Escapes LIKE metacharacters in a user-supplied needle.
     *
     * <p>Without this, a rule author searching for {@code "100%"} matches every row, and a search
     * for {@code "_"} matches every single-character value. Not a security hole on its own — the
     * value is still bound as a parameter — but a correctness hole, and in an investigative tool a
     * silently over-matching filter is worse than an error.
     */
    static String escapeLike(String raw) {
        StringBuilder out = new StringBuilder(raw.length() + 8);
        for (char c : raw.toCharArray()) {
            if (c == '%' || c == '_' || c == LIKE_ESCAPE) {
                out.append(LIKE_ESCAPE);
            }
            out.append(c);
        }
        return out.toString();
    }

    /** Exposed for diagnostics/UI: which fields a rule author may reference. */
    public List<String> queryableFields(FieldRegistry<?> registry) {
        return registry.queryableFields().stream().sorted(Comparator.naturalOrder()).toList();
    }
}
