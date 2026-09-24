/** Wildlife Ranch probability primitives. No biological rates are embedded here. */
export const YEAR_DAYS = 365.2425;
export function finite(value, name, min = 0, max = Infinity) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError(`${name} must be finite and in [${min}, ${max}]`);
  return value;
}
export const probability = (v, name = 'probability') => finite(v, name, 0, 1);
export function hazardProbability(hazardPerDay, days) {
  finite(hazardPerDay, 'hazardPerDay'); finite(days, 'days');
  return -Math.expm1(-hazardPerDay * days);
}
/** Valid only for a net/cause-specific survival probability over a known exposure.
 * Observed ALL-CAUSE survival is a calibration target, never extra natural mortality.
 */
export function hazardFromNetSurvival(survival, days, basis) {
  if (basis !== 'net-cause-specific') throw new Error('All-cause survival is not a background mortality rate');
  probability(survival, 'survival'); finite(days, 'days', Number.MIN_VALUE);
  if (survival === 0) throw new RangeError('Zero survival has no finite constant hazard');
  return -Math.log(survival) / days;
}
export function validateProfile(p, {allowProvisional = false} = {}) {
  if (!p || p.basis !== 'cause-specific-hazards' || p.unit !== 'per-day')
    throw new Error('Profile requires cause-specific-hazards with explicit per-day units');
  if (!p.id || !p.version || !p.species || !p.region) throw new Error('Profile identity, species and region required');
  if (!['provisional', 'calibrated'].includes(p.status)) throw new Error('Unknown profile status');
  if (!allowProvisional && p.status !== 'calibrated') throw new Error('Uncalibrated profile: explicit sandbox opt-in required');
  if (p.status === 'calibrated' && (!p.sourceIds?.length || !p.validationReceipt))
    throw new Error('Calibrated profile requires sources and a validation receipt');
  if (!Array.isArray(p.bands) || !p.bands.length) throw new Error('Age bands required');
  let previous = 0;
  p.bands.forEach((b, i) => {
    if (b.fromDays !== previous) throw new Error('Age bands must be continuous, starting at birth');
    if (b.toDays === null) {
      if (i !== p.bands.length - 1) throw new Error('Open-ended age band must be last');
    } else {
      finite(b.toDays, 'toDays');
      if (b.toDays <= previous) throw new Error('Age band must have positive duration');
    }
    if (!b.hazards || !Object.keys(b.hazards).length) throw new Error('Explicit hazard values required');
    for (const [cause, rate] of Object.entries(b.hazards)) {
      if (['all-cause', 'predation', 'vehicle', 'harvest'].includes(cause))
        throw new Error(`Cause ${cause} belongs to observed totals or the explicit event layer`);
      finite(rate, cause);
    }
    previous = b.toDays;
  });
  if (p.bands.at(-1).toDays !== null) throw new Error('Final age band must be open-ended: no fixed expiry age');
  return p;
}
/** Exact integral for piecewise-constant, age-dependent competing hazards. */
export function lifeSegments(profile, ageDays, elapsedDays, options) {
  validateProfile(profile, options); finite(ageDays, 'ageDays'); finite(elapsedDays, 'elapsedDays');
  const end = ageDays + elapsedDays; finite(end, 'endAgeDays');
  return profile.bands.flatMap(b => {
    const from = Math.max(ageDays, b.fromDays), to = Math.min(end, b.toDays ?? Infinity);
    return to > from ? [{offsetDays: from - ageDays, days: to - from, hazards: {...b.hazards}}] : [];
  });
}
export function survivalProbability(segments) {
  let hazard = 0;
  for (const s of segments) {
    finite(s.days, 'segment days');
    for (const rate of Object.values(s.hazards)) hazard += finite(rate, 'cause rate') * s.days;
  }
  return Math.exp(-hazard);
}
/** One exponential clock, one cause. Cannot assign several deaths to one animal.
 * Return remainingClock to preserve the same fate across subdivisions of time.
 */
export function sampleLifeEvent(segments, unitUniform, causeUniform, remainingClock = null) {
  probability(unitUniform, 'unitUniform'); probability(causeUniform, 'causeUniform');
  if (unitUniform >= 1 || causeUniform >= 1) throw new RangeError('RNG samples must be less than 1');
  let clock = remainingClock ?? -Math.log1p(-unitUniform);
  finite(clock, 'remainingClock');
  for (const segment of segments) {
    finite(segment.offsetDays, 'offsetDays'); finite(segment.days, 'days');
    const entries = Object.entries(segment.hazards).sort(([a], [b]) => a.localeCompare(b));
    const total = entries.reduce((sum, [, rate]) => sum + finite(rate, 'hazard'), 0);
    if (total === 0) continue;
    const exposure = total * segment.days;
    if (clock < exposure) {
      let selector = causeUniform * total;
      for (const [cause, rate] of entries) {
        selector -= rate;
        if (selector < 0) return {death: true, cause, offsetDays: segment.offsetDays + clock / total, remainingClock: 0};
      }
      throw new Error('Cause selection failed');
    }
    clock -= exposure;
  }
  return {death: false, remainingClock: clock};
}
/** Mechanistic hypothesis, NOT a fitted collision model: Poisson traffic arrivals.
 * collisionGivenOverlap incorporates driver response and road conditions; it must
 * be separately estimated. National driver collision odds are not animal odds.
 */
export function crossingProbabilities({vehiclesPerHour, exposureSeconds, collisionGivenOverlap, fatalGivenCollision}) {
  finite(vehiclesPerHour, 'vehiclesPerHour'); finite(exposureSeconds, 'exposureSeconds');
  probability(collisionGivenOverlap, 'collisionGivenOverlap'); probability(fatalGivenCollision, 'fatalGivenCollision');
  const overlap = -Math.expm1(-vehiclesPerHour * exposureSeconds / 3600);
  const collision = overlap * collisionGivenOverlap;
  return {overlap, collision, fatal: collision * fatalGivenCollision,
    injured: collision * (1 - fatalGivenCollision), clear: 1 - collision};
}
export function requireCalibration(registry, species, region) {
  const needed = ['age-sex-survival', 'reproduction', 'food-budget', 'movement', 'cause-specific-mortality'];
  const missing = needed.filter(metric => !registry.some(r => r.species === species && r.region === region &&
    r.metric === metric && r.status === 'validated' && r.sourceId && r.validationReceipt));
  return {ready: missing.length === 0, missing};
}
