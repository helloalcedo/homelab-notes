const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const INTRO_SPRING_OMEGA = 13;
const INTRO_SPRING_DAMPING = 0.86;
const INTRO_SPRING_DAMPED_OMEGA = INTRO_SPRING_OMEGA
  * Math.sqrt(1 - INTRO_SPRING_DAMPING * INTRO_SPRING_DAMPING);

export const INTRO_MOTION = Object.freeze({
  tensionStart: 0.025,
  tensionEnd: 0.16,
  travelStart: 0.12,
  travelEnd: 0.60,
  settleStart: 0.60,
  settlePeak: 0.645,
  greetingStop: 0.72,
  greetingThreshold: 0.35,
  dwellEnd: 0.88,
  chromeReveal: 0.90,
  releaseStart: 0.88,
  releaseEnd: 1,
});

export function introSmoother(from, to, value) {
  const amount = clamp((value - from) / Math.max(0.0001, to - from));
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

/** Pure, allocation-free-friendly values for the scene-zero particle pose. */
export function introMotionState(value) {
  const progress = clamp(value);
  const travel = introSmoother(INTRO_MOTION.travelStart, INTRO_MOTION.travelEnd, progress);
  const settleIn = introSmoother(INTRO_MOTION.settleStart, INTRO_MOTION.settlePeak, progress);
  const settleOut = 1 - introSmoother(INTRO_MOTION.settlePeak, INTRO_MOTION.greetingStop, progress);
  return {
    progress,
    tension: introSmoother(INTRO_MOTION.tensionStart, INTRO_MOTION.tensionEnd, progress) * (1 - travel),
    travel,
    nameTravel: introSmoother(0.04, 0.60, progress),
    face: introSmoother(0.43, 0.57, travel),
    roll: Math.abs(Math.cos(Math.PI * travel)),
    arc: Math.sin(Math.PI * travel),
    faceOpacity: Math.max(
      1 - introSmoother(0.07, 0.29, progress),
      introSmoother(0.38, 0.57, progress),
    ),
    settle: settleIn * settleOut,
    release: introSmoother(INTRO_MOTION.releaseStart, INTRO_MOTION.releaseEnd, progress),
  };
}

export function introPhase(value) {
  const progress = clamp(value);
  if (progress < INTRO_MOTION.tensionStart) return 'name';
  if (progress < INTRO_MOTION.travelStart) return 'tension';
  if (progress < INTRO_MOTION.travelEnd) return 'fold';
  if (progress < INTRO_MOTION.greetingStop) return 'settle';
  if (progress < INTRO_MOTION.releaseStart) return 'greeting';
  return 'release';
}

/**
 * Advance a scalar underdamped spring using its closed-form solution.
 * The analytic step keeps the same feel across refresh rates and direction
 * changes, while the dt cap prevents a restored background tab from leaping.
 */
export function stepIntroSpring(position, velocity, target, deltaSeconds) {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const safePosition = Number.isFinite(position) ? position : safeTarget;
  const safeVelocity = Number.isFinite(velocity) ? velocity : 0;
  const dt = Math.max(0, Math.min(0.05, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  if (dt === 0) return { position: safePosition, velocity: safeVelocity };

  const displacement = safePosition - safeTarget;
  const decayRate = INTRO_SPRING_DAMPING * INTRO_SPRING_OMEGA;
  const angle = INTRO_SPRING_DAMPED_OMEGA * dt;
  const decay = Math.exp(-decayRate * dt);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const nextDisplacement = decay * (
    displacement * cosine
    + ((safeVelocity + decayRate * displacement) / INTRO_SPRING_DAMPED_OMEGA) * sine
  );
  const nextVelocity = decay * (
    safeVelocity * cosine
    - ((decayRate * safeVelocity + INTRO_SPRING_OMEGA * INTRO_SPRING_OMEGA * displacement)
      / INTRO_SPRING_DAMPED_OMEGA) * sine
  );

  return {
    position: safeTarget + nextDisplacement,
    velocity: nextVelocity,
  };
}
