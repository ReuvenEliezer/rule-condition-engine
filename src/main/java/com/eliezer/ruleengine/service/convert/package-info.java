/**
 * Entity&nbsp;&harr;&nbsp;view-model mappers.
 *
 * <p>One {@code VmMapper} per record type. {@link com.eliezer.ruleengine.service.convert.AbstractVmMapper}
 * implements the create-vs-load dispatch on {@code vm.id() == null}; concrete mappers supply
 * {@code createInstance}, {@code findById} and {@code applyToEntity}. {@code toVm} never loads child
 * collections; {@code toVmWithChildren} adds the first page of each relation plus its total for the
 * detail path only, so a list read never materialises an unbounded relation.
 */
package com.eliezer.ruleengine.service.convert;
