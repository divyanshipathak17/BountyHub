/** Normalise a list of skill/tag strings: trim, lower-case, de-duplicate, drop empties. */
function normalizeTags(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** A mentor is eligible when the bounty has no tags or they share at least one skill. */
function isEligible(mentorSkills, bountyTags) {
  if (!bountyTags || bountyTags.length === 0) return true;
  const skills = new Set(normalizeTags(mentorSkills));
  return normalizeTags(bountyTags).some((t) => skills.has(t));
}

module.exports = { normalizeTags, isEligible };
