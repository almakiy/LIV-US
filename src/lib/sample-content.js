// Starter articles for non-production previews. General educational text, safe to edit or delete from /admin/content.
const SAMPLE_ARTICLES = [
  {
    slug: 'quality-management-pdca-in-plain-language', category: 'quality', kind: 'guide', tags: ['iso 9001', 'pdca', 'quality'],
    title: 'Quality management in plain language: the PDCA cycle',
    summary: 'A short guide to Plan-Do-Check-Act, the loop behind most quality management systems.',
    body_md: `Most quality management systems, including those built around ISO 9001, rest on one simple loop: **Plan, Do, Check, Act**.

## The four steps

1. **Plan** – define the objective, the process and the measure of success.
2. **Do** – carry out the plan on a small, controlled scale first.
3. **Check** – compare results with the objective. What worked? What did not?
4. **Act** – standardize what worked, or adjust the plan and go round again.

## Why it works

- It turns "we think it is fine" into evidence.
- It makes improvement a routine instead of a project.
- It gives teams a shared language for problems and fixes.

## A quick example

| Step | Training provider example |
|---|---|
| Plan | Aim for 95% of trainees passing the assessment on the first attempt |
| Do | Pilot a revised practice exercise with one cohort |
| Check | Compare pass rates and feedback with the previous cohort |
| Act | Adopt the exercise for all cohorts, then set the next target |

> Quality is not a one-off audit. It is the habit of checking your own work and acting on what you find.`,
  },
  {
    slug: 'running-an-effective-toolbox-talk', category: 'safety', kind: 'article', tags: ['toolbox talk', 'site safety', 'training'],
    title: 'Running an effective toolbox talk in ten minutes',
    summary: 'Short pre-shift safety talks only work if they are specific, interactive and recorded. A practical format.',
    body_md: `A toolbox talk is a brief safety briefing given to a work crew, usually before a shift starts. Done well, it is one of the cheapest safety controls on a site.

## A ten-minute format

1. **Pick one hazard** that applies to today's work, not a generic topic.
2. **Say why it matters** – use a real near miss from your own site if you have one.
3. **Show the control** – demonstrate the correct method or equipment.
4. **Ask, don't lecture** – "What could go wrong here?" gets more attention than a speech.
5. **Record it** – date, topic, who attended, and any questions raised.

## Common mistakes

- Reading from a sheet without adapting it to the task.
- Talking for twenty minutes, then losing the room.
- Not following up on concerns the crew raises.

## What good looks like

Workers can say, in their own words, the one thing they will do differently today. If they cannot, the talk was too long or too vague.`,
  },
  {
    slug: 'work-breakdown-structure-basics', category: 'project-management', kind: 'guide', tags: ['wbs', 'planning', 'scope'],
    title: 'Work breakdown structure basics: how to break a project into manageable pieces',
    summary: 'A work breakdown structure (WBS) splits project scope into deliverables and work packages you can estimate, assign and track.',
    body_md: `A **work breakdown structure (WBS)** divides the total scope of a project into smaller, manageable parts. It is organized around *deliverables*, not activities.

## Building one

1. Start with the final deliverable at the top.
2. Split it into its major components.
3. Keep splitting until each piece is a **work package** that one team can estimate, assign and track.
4. Check the **100% rule**: the pieces under any item must add up to all of that item's scope, with nothing missing and nothing extra.

## A small example: launching a training course

- **1. Course launch**
  - 1.1 Curriculum
  - 1.2 Learning materials
  - 1.3 Assessment
  - 1.4 Certification setup
  - 1.5 Enrollment and communications

## Tips

- Name items with nouns ("Assessment bank"), not verbs.
- If a work package takes longer than a few weeks, split it further.
- Use the WBS as the base for schedules, budgets and risk lists.`,
  },
];
module.exports = { SAMPLE_ARTICLES };
