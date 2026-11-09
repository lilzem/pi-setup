const sections = (guide: string) =>
  guide
    .split(/^(?=## )/m)
    .slice(1)
    .map((s) => ({ topic: s.slice(3, s.indexOf("\n")).trim().toLowerCase(), body: s.trim() }));

export const guideTopics = (guide: string): string[] => sections(guide).map((s) => s.topic);

export function guideSection(guide: string, topic: string): string {
  const wanted = topic.trim().toLowerCase();
  if (!wanted) return guide;
  const match = sections(guide).find((s) => s.topic === wanted);
  return match?.body ?? `Unknown topic \`${topic.trim()}\`. Topics: ${guideTopics(guide).join(", ")}`;
}
