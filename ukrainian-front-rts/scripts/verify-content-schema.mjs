import assert from 'node:assert/strict';

import {
  CONTENT_REFERENCE_TARGETS,
  CONTENT_SCHEMA_FAMILIES,
  CONTENT_SCHEMA_VERSION,
  CONTENT_SCHEMAS,
  TECH_NODE_FAMILIES,
  applyContentDefaults,
  defaultFieldsFor,
  getContentSchema,
  requiredFieldsFor,
} from '../src/content-schema.js';

const EXPECTED_FAMILIES = [
  'factions',
  'units',
  'buildings',
  'abilities',
  'upgrades',
  'missions',
  'maps',
  'aiProfiles',
];
const EXPECTED_REFERENCE_TARGETS = [...EXPECTED_FAMILIES, 'tech-nodes'];
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

assert.equal(CONTENT_SCHEMA_VERSION, 1, 'Compatible optional technology fields must remain schema version 1.');
assert.deepEqual(CONTENT_SCHEMA_FAMILIES, EXPECTED_FAMILIES, 'The schema registry must contain the canonical content families in stable order.');
assert.deepEqual(Object.keys(CONTENT_SCHEMAS), EXPECTED_FAMILIES, 'The schema registry keys must match the exported family list.');
assert.deepEqual(TECH_NODE_FAMILIES, ['buildings', 'upgrades'], 'Technology nodes must use the shared building/upgrade namespace.');
assert.deepEqual(CONTENT_REFERENCE_TARGETS, EXPECTED_REFERENCE_TARGETS, 'Reference targets must include the virtual tech-node union.');

for (const family of CONTENT_SCHEMA_FAMILIES) {
  const contract = getContentSchema(family);
  assert.equal(contract.version, CONTENT_SCHEMA_VERSION, `${family} must use the global schema version.`);
  assert.ok(['record', 'array'].includes(contract.collection), `${family} has an invalid collection kind.`);
  assert.equal(contract.allowExtensions, true, `${family} must remain additive within schema v1.`);
  assert.ok(contract.identity && typeof contract.identity === 'object', `${family} needs identity metadata.`);
  assert.ok(['field', 'collection-key'].includes(contract.identity.source), `${family} has an invalid identity source.`);
  assert.ok(contract.fields && Object.keys(contract.fields).length > 0, `${family} needs fields.`);

  if (contract.identity.source === 'field') {
    const identityField = contract.identity.field;
    assert.equal(typeof identityField, 'string', `${family} field identity needs a field name.`);
    assert.equal(contract.fields[identityField]?.required, true, `${family}.${identityField} must be required because it is the identity field.`);
  }

  for (const [fieldName, field] of Object.entries(contract.fields)) {
    assert.equal(typeof field.type, 'string', `${family}.${fieldName} needs a type.`);
    assert.equal(typeof field.required, 'boolean', `${family}.${fieldName} needs required metadata.`);

    if (field.required) assert.equal(hasOwn(field, 'default'), false, `${family}.${fieldName} cannot be required and defaulted.`);
    else assert.equal(hasOwn(field, 'default'), true, `${family}.${fieldName} needs an explicit default.`);

    if (field.reference) assert.ok(CONTENT_REFERENCE_TARGETS.includes(field.reference), `${family}.${fieldName} references unknown target ${field.reference}.`);
    if (field.acceptsLegacyScalar) {
      assert.equal(field.type, 'string[]', `${family}.${fieldName} may accept a legacy scalar only when the canonical type is string[].`);
      assert.equal(field.reference, 'tech-nodes', `${family}.${fieldName} legacy scalar support is reserved for tech-node prerequisites.`);
    }
  }

  const required = requiredFieldsFor(family);
  const defaults = defaultFieldsFor(family);
  assert.ok(required.length > 0, `${family} must have at least one required field.`);
  assert.equal(required.some((fieldName) => hasOwn(defaults, fieldName)), false, `${family} required and defaulted fields must not overlap.`);

  const first = applyContentDefaults(family, {});
  const second = applyContentDefaults(family, {});
  assert.deepEqual(first, defaults, `${family} must materialize every declared default.`);
  assert.deepEqual(second, defaults, `${family} default materialization must be deterministic.`);

  for (const [fieldName, value] of Object.entries(first)) {
    if (Array.isArray(value)) {
      value.push('mutation-test');
      assert.equal(second[fieldName].length, 0, `${family}.${fieldName} arrays must not be shared.`);
    } else if (value && typeof value === 'object') {
      value.mutationTest = true;
      assert.equal(hasOwn(second[fieldName], 'mutationTest'), false, `${family}.${fieldName} objects must not be shared.`);
    }
  }

  const [overrideField, overrideDefault] = Object.entries(defaults)[0] || [];
  if (overrideField) {
    const override = typeof overrideDefault === 'boolean'
      ? !overrideDefault
      : typeof overrideDefault === 'number'
        ? overrideDefault + 17
        : Array.isArray(overrideDefault)
          ? ['explicit']
          : overrideDefault && typeof overrideDefault === 'object'
            ? { explicit: true }
            : 'explicit';
    const applied = applyContentDefaults(family, { [overrideField]: override });
    assert.deepEqual(applied[overrideField], override, `${family} must preserve explicit values.`);
  }
}

for (const family of TECH_NODE_FAMILIES) {
  const fields = getContentSchema(family).fields;
  assert.equal(fields.requires.reference, 'tech-nodes', `${family}.requires must target the shared tech namespace.`);
  assert.deepEqual(fields.requires.default, [], `${family}.requires must default to no prerequisites.`);
  assert.equal(fields.factions.reference, 'factions', `${family}.factions must reference faction IDs.`);
  assert.equal(fields.missionLocks.reference, 'missions', `${family}.missionLocks must reference mission IDs.`);
  assert.equal(fields.exclusiveGroup.default, null, `${family}.exclusiveGroup must default to no exclusive choice.`);
  assert.equal(fields.techRoot.default, false, `${family}.techRoot must default to false.`);
}
assert.equal(getContentSchema('missions').fields.availableTech.reference, 'tech-nodes');
assert.equal(getContentSchema('missions').fields.lockedTech.reference, 'tech-nodes');

assert.throws(() => getContentSchema('unknown'), /Unknown content schema family/, 'Unknown schema families must fail clearly.');
assert.throws(() => applyContentDefaults('units', null), /must be an object/, 'Default materialization must reject non-object content.');

console.log(`Content schema verification passed for ${CONTENT_SCHEMA_FAMILIES.length} families and the shared technology namespace.`);
