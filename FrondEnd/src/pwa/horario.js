export function requestedInstant(day, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) throw Error("Elige una fecha y una hora.");
  const target = Date.parse(day + "T" + time + ":00Z");
  const clock = new Intl.DateTimeFormat("en-US", {timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  let instant = target;
  for (let i=0; i<4; i++) {
    const parts = Object.fromEntries(clock.formatToParts(instant).map(p => [p.type,p.value]));
    const shown = Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);
    if (shown === target) return new Date(instant).toISOString();
    instant += target - shown;
  }
  throw Error("Esa hora no existe en la zona de la barbería. Elige otra.");
}
