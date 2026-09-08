function translated(t, key, fallback, variables) {
  if (typeof t !== 'function') return fallback;
  const value = t(key, variables);
  return value === `[${key}]` ? fallback : value;
}

export function localizedGameplayLabel(t, domain, id, field, fallback) {
  if (!domain || !id || !field) return fallback;
  return translated(t, `gameContent.${domain}.${id}.${field}`, fallback);
}

export function createLocalizedMissionPresentation(t, mission, region) {
  if (!mission?.id || !mission?.region) {
    throw new TypeError('Localized mission presentation requires an authored mission with id and region.');
  }
  if (!region) throw new TypeError(`Localized mission presentation requires region ${mission.region}.`);

  const missionKey = `campaignContent.missions.${mission.id}`;
  const regionKey = `campaignContent.regions.${mission.region}`;
  const objectives = (mission.objectives || []).map((objective, index) =>
    translated(t, `${missionKey}.objective${index + 1}`, objective));

  return Object.freeze({
    title: translated(t, `${missionKey}.title`, mission.title),
    story: translated(t, `${missionKey}.story`, mission.story),
    objectives: Object.freeze(objectives),
    region: Object.freeze({
      name: translated(t, `${regionKey}.name`, region.name),
      subtitle: translated(t, `${regionKey}.subtitle`, region.subtitle),
      terrain: translated(t, `${regionKey}.terrain`, region.terrain),
    }),
  });
}
