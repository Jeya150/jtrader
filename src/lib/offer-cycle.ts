export const OFFER_CYCLE_MS = 9 * 60 * 60 * 1000;

export type CourseOffer = {
  courseId: string;
  offerPrice: number;
  regularPrice: number;
};

export const COURSE_OFFERS: Record<string, CourseOffer> = {
  'basic-share-market': {courseId: 'basic-share-market', offerPrice: 1500, regularPrice: 2000},
  'option-trading': {courseId: 'option-trading', offerPrice: 9999, regularPrice: 13000},
};

export function getOfferState(now = Date.now()) {
  const cycleStart = Math.floor(now / OFFER_CYCLE_MS) * OFFER_CYCLE_MS;
  return {
    active: true,
    cycleStart,
    endsAt: cycleStart + OFFER_CYCLE_MS,
    remainingMs: cycleStart + OFFER_CYCLE_MS - now,
  };
}

export function getCurrentCoursePrice(courseId: string, now = Date.now()) {
  const offer = COURSE_OFFERS[courseId];
  if (!offer) return null;
  const cycle = getOfferState(now);
  return {price: cycle.active ? offer.offerPrice : offer.regularPrice, ...offer, ...cycle};
}
