// Bump VERSION and add an entry on top of CHANGELOG with every release.
export const VERSION = '2.3';

export const CHANGELOG = [
  {
    version: '2.3',
    date: 'November 19, 2026',
    items: [
      'New Tasks tab (list icon in the bar). It looks like Today, but for one-off things: tick it once and it stays done on that day.',
      'Tasks can have steps, steps can have sub-steps, as deep as you like. Each one has a name, icon, description and day, and you can duplicate it or move it under another task in its edit window.',
      'Tasks count in your Reports percentage like a habit, shown as a gray circle. You can share a task to a group too.',
      'Reports: all your habits are now icons right under the percentage. Tap one to filter, tap again to clear.',
      'Habit editor: no more Today / Tomorrow buttons (it starts today, tap the date to change it) and the date is centered.',
    ],
  },
  {
    version: '2.2',
    date: 'November 19, 2026',
    items: [
      'Reports: the 21 dots are now a small calendar. The more of that day you did, the stronger the green. Tap a habit and the calendar turns to that habit\'s color.',
      'Tap any day in the Reports calendar to open that day on the Today tab.',
      'Today: tap the day title ("Today") and a calendar slides down from the top. Tap any day to jump to it.',
    ],
  },
  {
    version: '2.1.4',
    date: 'November 19, 2026',
    items: ['Habit screen: tap anywhere that is not a button to close it.'],
  },
  {
    version: '2.1.3',
    date: 'November 19, 2026',
    items: ['Every Edit button now uses the plain pencil icon.'],
  },
  {
    version: '2.1.2',
    date: 'November 19, 2026',
    items: [
      'Habit screen: the habit name now sits in the middle of the top bar, between Edit and the close button. The icon, goal line and 21-day percentage are gone.',
      'Edit is now the Tabler pencil-on-paper icon, and the top buttons line up with the rest of the content.',
      'Timer buttons are circles showing −5 / +5. The step follows the goal: 1 minute for short goals, up to 15 for long ones.',
    ],
  },
  {
    version: '2.1.1',
    date: 'November 19, 2026',
    items: [
      'Removed the day streak. Only the 21-day rate is shown now.',
      'Back and view buttons are now circles, like every other round button.',
      'Habit screen: Edit on the left and an X to close on the right, with more room around them.',
    ],
  },
  {
    version: '2.1',
    date: 'November 19, 2026',
    items: [
      'Press and hold: the item lifts, the background blurs, and a small menu appears next to it. A normal tap still works as before.',
      'Habits: Log, Edit, Share to a group, Reset this day, Delete. Also on posts, comments, people, groups and your photo.',
      'The log screen is now a compact sheet, at most 60% of the screen tall.',
    ],
  },
  {
    version: '2.0.2',
    date: 'November 19, 2026',
    items: ['The Copy button no longer appears on your own posts, and copying a habit you already have is blocked, so a stray tap can\u2019t duplicate it.'],
  },
  {
    version: '2.0.1',
    date: 'November 19, 2026',
    items: ['You can reply to replies. They stay in the same thread and tag the person you answered.', 'A confirmation pop-up now appears before anything is deleted or removed.'],
  },
  {
    version: '2.0',
    date: 'November 19, 2026',
    items: [
      'A brand-new look, built from your Figma design: new Today screen, rings, cards and bottom bar.',
      'Reports measure your last 21 days, for all habits or one at a time, colored from red to green.',
      'Social: friends, public and private groups with admins, invitations, posts, comments and likes.',
      'Account: crop your photo, edit your username and About me.',
    ],
  },
  {
    version: '1.3.2',
    date: 'November 14, 2026',
    items: ['Fast taps on + and \u2212 (and every other button) are now all counted.'],
  },
  {
    version: '1.3.1',
    date: 'November 14, 2026',
    items: ['Removed the stray shadow at the top of the screen.', 'The tab bar\u2019s shadow is no longer cut off at the bottom.'],
  },
  {
    version: '1.3',
    date: 'November 14, 2026',
    items: [
      'New look for Today: white cards, soft colored icon circles, a big \u201cToday\u201d title and a check when everything is done.',
      'Tap the ring on a habit to log it instantly (+1, tick, or start/pause the timer). Tap the card to open it.',
      'Pencil button: edit mode, where tapping a habit opens its settings.',
      'Tab bar now shows labels.',
    ],
  },
  {
    version: '1.2.3',
    date: 'November 14, 2026',
    items: ['The empty Today screen is simpler: just a quiet \u201cNo habits\u201d.'],
  },
  {
    version: '1.2.2',
    date: 'November 14, 2026',
    items: [
      'The app no longer zooms (pinch or double-tap) or shifts sideways when you tap a field.',
      'The start-date field fits inside its card, and numbers in the goal stepper are no longer cut off.',
    ],
  },
  {
    version: '1.2.1',
    date: 'November 14, 2026',
    items: ['If Google sign-in fails, the login screen now shows what went wrong.'],
  },
  {
    version: '1.2',
    date: 'November 14, 2026',
    items: [
      'Everything is a touch smaller, so more fits on screen.',
      'Buttons, chips, tags, fields and switches are now fully rounded.',
    ],
  },
  {
    version: '1.1',
    date: 'November 14, 2026',
    items: [
      'New font: Lexend — regular for text, bold for titles.',
      'Browse days on the Today screen with the arrows, and log things you forgot on past days.',
      'Choose when a habit starts, so you can plan new habits for later.',
      'Reminders: allow notifications in Settings, then set a time on any habit.',
      'Appearance setting: System, Light or Dark.',
      'This Updates page, with the current version number.',
    ],
  },
  {
    version: '1.0',
    date: 'November 14, 2026',
    items: [
      'First release: daily progress ring, habits with streaks, focus mode with counter and timer.',
      'Progress charts with streaks and heatmap.',
      'Google sign-in, friends, groups and shared habits, synced in real time.',
      'Every Tabler icon (outline and filled) and an 11-color palette.',
    ],
  },
];
