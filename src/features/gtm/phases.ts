export interface PhaseDefinition {
  id: number
  name: string
  shortName: string
  duration: string
  description: string
  exitCriteria: { key: string; label: string }[]
  weeklyTargets: { label: string; target: string }[]
  timeBlocks: { duration: string; task: string }[]
}

export const PHASES: PhaseDefinition[] = [
  {
    id: 1,
    name: 'Prepare Your Ammo',
    shortName: 'Prep',
    duration: 'Days 1-5',
    description: 'All assets ready before any outreach begins.',
    exitCriteria: [
      { key: 'demos', label: '3 demo clips ready to share' },
      { key: 'oneliner', label: 'One-liner finalized' },
      { key: 'xprofile', label: 'X profile optimized' },
      { key: 'linkedin', label: 'LinkedIn headline updated' },
      { key: 'cta', label: 'Landing page CTA working and tested' },
    ],
    weeklyTargets: [],
    timeBlocks: [
      { duration: 'Day 1', task: 'Write one-liner. Test 5 versions.' },
      { duration: 'Day 2', task: 'Record Demo #1 -- silent agent failure (30-60s)' },
      { duration: 'Day 3', task: 'Record Demo #2 -- real repo before vs after (30-60s)' },
      { duration: 'Day 4', task: 'Record Demo #3 -- speed/integration demo (30-60s)' },
      { duration: 'Day 5', task: 'Set up X profile, LinkedIn, Reddit karma check, organize clips' },
    ],
  },
  {
    id: 2,
    name: 'Outbound Blitz',
    shortName: 'Outbound',
    duration: 'Weeks 2-4',
    description: '5 people actively trying the product by end of Week 4.',
    exitCriteria: [
      { key: 'users5', label: '5+ people actively using the product' },
      { key: 'dms100', label: '100+ DMs sent total' },
      { key: 'replies200', label: '200+ public replies/engagements on X' },
      { key: 'bestangle', label: 'Know which DM angle gets the best response rate' },
    ],
    weeklyTargets: [
      { label: 'DMs sent (X)', target: '50/week' },
      { label: 'Thoughtful replies on X', target: '50-75/week' },
      { label: 'LinkedIn intro requests', target: '15/week' },
      { label: 'Reddit/Discord replies', target: '10-15/week' },
      { label: 'Demo calls booked', target: '3-5/week' },
    ],
    timeBlocks: [
      { duration: '45 min', task: 'Engage on X. Find 10-15 posts about coding agents. Leave thoughtful replies. NO pitching.' },
      { duration: '60 min', task: 'Send 10 DMs on X. Personalize each DM, attach relevant demo clip.' },
      { duration: '30 min', task: 'LinkedIn warm outreach. Send 3 messages asking for intros.' },
      { duration: '30 min', task: 'Reddit/Discord lurking. Reply to 2-3 relevant threads.' },
      { duration: '15 min', task: 'Log everything. Update tracker.' },
    ],
  },
  {
    id: 3,
    name: 'Feedback + Social Proof',
    shortName: 'Feedback',
    duration: 'Weeks 5-6',
    description: 'Get testimonials from early users and start posting your own content.',
    exitCriteria: [
      { key: 'testimonials', label: '3+ written testimonials with specific results' },
      { key: 'users10', label: '10+ active users' },
      { key: 'followers50', label: '50+ followers on X (organic)' },
      { key: 'bestchannel', label: 'Know your best acquisition channel' },
    ],
    weeklyTargets: [
      { label: 'User conversations', target: '3-5/week' },
      { label: 'X posts (own content)', target: '2/week' },
      { label: 'LinkedIn posts', target: '1/week' },
      { label: 'DMs sent (maintenance)', target: '25/week' },
    ],
    timeBlocks: [
      { duration: '45 min', task: 'Continue outbound (5 DMs/day instead of 10)' },
      { duration: '45 min', task: 'Talk to users. Ask: What works? What\'s broken? Would you recommend?' },
      { duration: '45 min', task: 'Create 2 posts/week for X. Use real data from the product.' },
      { duration: '30 min', task: 'LinkedIn post 1x/week. Business angle content.' },
      { duration: '15 min', task: 'Log and review metrics.' },
    ],
  },
  {
    id: 4,
    name: 'Public Launch',
    shortName: 'Launch',
    duration: 'Weeks 7-8',
    description: 'One concentrated push to a wider audience.',
    exitCriteria: [
      { key: 'signups25', label: '25+ signups from launch week' },
      { key: 'channeldata', label: 'Clear data on which channel drove the most signups' },
      { key: 'followups', label: 'A list of follow-up conversations to have' },
    ],
    weeklyTargets: [],
    timeBlocks: [
      { duration: 'Week 7 Mon', task: 'Write Show HN post. Lead with the problem.' },
      { duration: 'Week 7 Tue', task: 'Prepare Product Hunt page (description, images, demo).' },
      { duration: 'Week 7 Wed', task: 'Alert early users to comment on HN/PH.' },
      { duration: 'Week 7 Thu', task: 'Write blog post: "What we learned analyzing X thousand agent outputs"' },
      { duration: 'Week 7 Fri', task: 'Final review. Test all links, signup flow, onboarding.' },
      { duration: 'Week 8 Mon', task: 'Show HN launch. Post 8-9 AM EST. Respond to every comment all day.' },
      { duration: 'Week 8 Tue', task: 'Product Hunt launch. Share across all channels.' },
      { duration: 'Week 8 Wed-Thu', task: 'Ride the wave. Respond to everything. Follow up with interested people.' },
      { duration: 'Week 8 Fri', task: 'Review all data. Signups, sources, messaging effectiveness.' },
    ],
  },
  {
    id: 5,
    name: 'Double Down',
    shortName: 'Scale',
    duration: 'Week 9+',
    description: 'Scale what works, kill what doesn\'t.',
    exitCriteria: [
      { key: 'paying', label: 'First paying customers' },
      { key: 'primarychannel', label: 'Primary channel identified and 70% of time allocated' },
      { key: 'youtube', label: 'YouTube channel started with real stories/data' },
    ],
    weeklyTargets: [],
    timeBlocks: [
      { duration: '60 min', task: 'Primary channel (whatever converted best)' },
      { duration: '30 min', task: 'Content creation (1-2 posts/week using real user data)' },
      { duration: '30 min', task: 'User conversations + support' },
    ],
  },
]

export const HEALTH_METRICS = [
  { key: 'dmResponseRate', label: 'DM Response Rate', healthy: 10, danger: 5, unit: '%', direction: 'above' as const },
  { key: 'demoToSignup', label: 'Demo-to-Signup', healthy: 30, danger: 15, unit: '%', direction: 'above' as const },
  { key: 'week1Retention', label: 'Week-1 Retention', healthy: 50, danger: 25, unit: '%', direction: 'above' as const },
  { key: 'timeToFirstValue', label: 'Time to First Value', healthy: 10, danger: 30, unit: 'min', direction: 'below' as const },
]

export const HARD_RULES = [
  'Never spend more than 3 hours/day on GTM -- protect your building/product time',
  'If users churn, stop marketing and fix the product -- no amount of outreach fixes a leaky bucket',
  'Track everything -- if you can\'t measure it, you can\'t improve it',
  'Personalize every DM -- mass outreach destroys your reputation in small communities',
  'Never pitch in public replies -- be helpful, let people come to you',
  'Review your metrics every Friday -- 30 minutes, decide what to change next week',
  'One channel at a time -- don\'t try to be everywhere, go deep where it works',
]
