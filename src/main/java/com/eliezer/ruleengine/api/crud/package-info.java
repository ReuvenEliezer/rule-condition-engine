/**
 * The generic REST layer of the uniform record-management contract.
 *
 * <p>{@link com.eliezer.ruleengine.api.crud.CrudController} implements save-or-update, read-one,
 * paged list and delete once; a concrete controller only declares
 * {@code extends CrudController<Entity, EntityVm, Id>} and a constructor. Page-size clamping,
 * identity-sort appending and the summary/detail Jackson-view split all live here so no resource
 * can drift from the contract.
 */
package com.eliezer.ruleengine.api.crud;
