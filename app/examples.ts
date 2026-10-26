import type { DeckSpec } from '../src/index'
import quarterly from '../examples/quarterly.json'

export const EXAMPLES: { id: string; name: string; spec: DeckSpec }[] = [
  { id: 'quarterly', name: 'Quarterly business review', spec: quarterly as DeckSpec },
  {
    id: 'launch',
    name: 'Launch retrospective',
    spec: {
      title: 'Spring launch retrospective',
      subtitle: 'The launch hit its sign-up goal; the first-week drop-off is the thing to fix.',
      period: '3 to 30 March 2026',
      footer: 'Product team · Internal',
      slides: [
        {
          title: 'Sign-ups beat the goal by 18%, and half of them left within a week',
          kpis: [
            { label: 'Sign-ups', value: '5,310', change: '+18% on goal', trend: [220, 410, 380, 520, 640, 700, 690] },
            { label: 'Active after 7 days', value: '49%', change: '-6 pts', better: 'up', direction: 'down' },
            { label: 'Paid conversion', value: '4.2%', change: '+0.8 pts' },
          ],
          bullets: ['Most sign-ups came from the two launch emails.', 'Week-one drop-off was worst on mobile.'],
          tones: ['good', 'bad'],
        },
        {
          title: 'Where the first week was lost',
          stacked: [
            { name: 'Desktop', done: 1620, running: 340, waiting: 210, failed: 90 },
            { name: 'Mobile', done: 980, running: 410, waiting: 530, failed: 260 },
            { name: 'Tablet', done: 210, running: 40, waiting: 55, failed: 15 },
          ],
        },
        {
          title: 'Three fixes, in order',
          actions: [
            { text: 'Shorten the mobile set-up from six steps to three.', why: 'Mobile lost 41% of people at step four.', priority: 'high' },
            { text: 'Send a day-two email with the one feature people used most.', why: 'Emails drove the launch; nothing followed them.', priority: 'medium' },
          ],
        },
      ],
    },
  },
]
