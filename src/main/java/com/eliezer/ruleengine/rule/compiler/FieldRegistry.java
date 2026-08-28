package com.eliezer.ruleengine.rule.compiler;

import com.eliezer.ruleengine.exception.UnknownFieldException;

import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The allow-list of queryable fields for one root entity.
 *
 * <p>Implemented as an interface with a static factory rather than a Spring bean per entity, so a
 * registry can be constructed in a unit test without a context. Concrete registries are exposed as
 * beans (see {@code PersonFieldRegistry}) and keyed by root type in {@code FieldRegistryConfig}.
 */
public interface FieldRegistry<T> {

    Class<T> rootType();

    Map<String, FieldDescriptor> descriptors();

    default FieldDescriptor require(String logicalName) {
        FieldDescriptor descriptor = descriptors().get(logicalName);
        if (descriptor == null) {
            throw new UnknownFieldException(logicalName, descriptors().keySet());
        }
        return descriptor;
    }

    default Set<String> queryableFields() {
        return descriptors().keySet();
    }

    static Map<String, FieldDescriptor> index(FieldDescriptor... descriptors) {
        return Stream.of(descriptors)
                .collect(Collectors.toUnmodifiableMap(FieldDescriptor::logicalName, Function.identity()));
    }
}
