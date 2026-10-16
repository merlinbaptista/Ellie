export interface Clock {
  now(): Date;
  isFake(): boolean;
  set(iso: string | null): void;
}

export function createClock(fakeNowIso?: string): Clock {
  let fakeNow = fakeNowIso ? new Date(fakeNowIso) : null;
  if (fakeNow && Number.isNaN(fakeNow.getTime())) throw new Error("Invalid fake clock date");
  return {
    now: () => (fakeNow ? new Date(fakeNow) : new Date()),
    isFake: () => fakeNow !== null,
    set(iso) {
      if (iso === null) {
        fakeNow = null;
        return;
      }
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) throw new Error("Invalid fake clock date");
      fakeNow = date;
    },
  };
}
