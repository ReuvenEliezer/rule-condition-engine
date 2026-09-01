/**
 * The generic service layer of the uniform record-management contract.
 *
 * <p>{@link com.eliezer.ruleengine.service.crud.AbstractEntityCrudService} owns the transaction
 * boundary, the explicit stale-version check, and the override hooks
 * ({@code beforeSave}, {@code innerSave}, {@code innerFindAll}, {@code innerDelete},
 * {@code findEntityById}) that let each record type contribute its own behaviour without touching
 * the shared contract. Entity&nbsp;&rarr;&nbsp;VM mapping runs inside the service transaction
 * because {@code spring.jpa.open-in-view} is false.
 */
package com.eliezer.ruleengine.service.crud;
