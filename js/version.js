// Bump VERSION and add an entry on top of CHANGELOG with every release.
export const VERSION = '2.14';

export const CHANGELOG = [
  {
    version: '2.14',
    date: 'November 21, 2026',
    items: [
      'Shared habits and tasks stay separate: everyone logs their own and has their own 100%. Cards now show when a friend has done it ("@name done"), and the habit or task screen has a Together strip with everyone and who is done today.',
      'Remind someone: press and hold a shared habit or task and choose Remind someone (or tap the Together strip), then tap the bell next to a friend who has not done it. They get a push notification and a card under Social → Notifications.',
    ],
  },
  {
    version: '2.13',
    date: 'November 20, 2026',
    items: [
      'Invite friends to a habit or a task: in its edit screen (Together → Invite friends) or from the press-and-hold menu. You can only invite friends, and as many as you like.',
      'They get the invitation in Social → Notifications. When they accept, they get their own copy to log, and the habit or task screen shows who is done today.',
    ],
  },
  {
    version: '2.12.4',
    date: 'November 20, 2026',
    items: ['Fixed: a long username made the group Members screen wider than the phone, so everything looked zoomed in and cut off. Long names now get cut with "…" instead.'],
  },
  {
    version: '2.12.3',
    date: 'November 20, 2026',
    items: ['Past the goal, the ring shows a + and how much more you did (for example +3, or +0.5 hours).'],
  },
  {
    version: '2.12.2',
    date: 'November 20, 2026',
    items: ['If you do more than the goal, the ring on the habit card shows how much you did instead of the check.'],
  },
  {
    version: '2.12.1',
    date: 'November 20, 2026',
    items: ['Tap on the progress ring (Today card and habit screen) now adds an amount that fits the goal: 1, 2, 5, 10 or 15 minutes for timed goals, and 1, 5, 10 or 50 for big counts. Press and hold still fills the circle.'],
  },
  {
    version: '2.12',
    date: 'November 20, 2026',
    items: [
      'Tasks tab: the day\'s tasks come first, and a Carried over section sits below them. It holds unfinished tasks from earlier days and tasks with no date, until you finish them.',
      'A task (or step) can now have no day: switch Day off in its edit screen. It shows under Carried over every day as Anytime.',
    ],
  },
  {
    version: '2.11',
    date: 'November 19, 2026',
    items: ['Sign in with Google now uses Google\'s own button, so the account screen says Muna instead of the long Supabase address. If it does not work on your phone, there is a link underneath to use the old way.'],
  },
  {
    version: '2.10',
    date: 'November 19, 2026',
    items: [
      'Tasks (and steps) can now have a color, like habits. The gray circle in Reports stays as the one icon that stands for all your tasks.',
      'Choosing an icon: outline and filled are now mixed in one list, with no filter. Each icon shows up in both styles next to each other.',
    ],
  },
  {
    version: '2.9.2',
    date: 'November 19, 2026',
    items: ['Smoother appearing: elements now fade in with a soft, slower curve while they rise, instead of snapping to full opacity (tabs and new cards).'],
  },
  {
    version: '2.9.1',
    date: 'November 19, 2026',
    items: ['The round X (cancel a friend request) is now centered in the end of its card, like the other round buttons.'],
  },
  {
    version: '2.9',
    date: 'November 19, 2026',
    items: ['Account has a new Appearance switch: Light, Dark or System. Dark uses the same Muna palette (the palette black for surfaces, the light gray for text). System follows your phone.'],
  },
  {
    version: '2.8.1',
    date: 'November 19, 2026',
    items: ['The big circle on the habit screen works like the ring on the Today card: tap it to add 1 (or 1 minute), press and hold to fill it and complete the habit.'],
  },
  {
    version: '2.8',
    date: 'November 19, 2026',
    items: [
      'Progress ring: tap it to add 1 (or 1 minute for timed habits). Press and hold it and the circle fills up; when it reaches 100% the habit or task is completed. Let go early and it springs back.',
      'New tab transition: the old tab disappears at once and the new one builds itself, top to bottom and left to right, each element rising up into place.',
    ],
  },
  {
    version: '2.7.1',
    date: 'November 19, 2026',
    items: ['Switching between Today and Tasks: the top row (view button, day arrows, plus) stays still instead of fading and reloading; only the content changes.'],
  },
  {
    version: '2.7',
    date: 'November 19, 2026',
    items: ['Swipe down on any screen or sheet to close it. Inside scrolling content it starts once you are at the top.'],
  },
  {
    version: '2.6.4',
    date: 'November 19, 2026',
    items: ['Date and time fields (start date, reminder time) now show their value centered in the pill instead of at the top-left.'],
  },
  {
    version: '2.6.3',
    date: 'November 19, 2026',
    items: ['Habit editor: no "min" next to the number; the question above now says "How many minutes, each day?".'],
  },
  {
    version: '2.6.2',
    date: 'November 19, 2026',
    items: ['Habit editor: the − and + buttons stay put when you switch between Count and Time. A new habit starts at 5 times (Count) or 30 minutes (Time).'],
  },
  {
    version: '2.6.1',
    date: 'November 19, 2026',
    items: ['Every screen now closes with an X in the top-right corner instead of a back arrow on the left.'],
  },
  {
    version: '2.6',
    date: 'November 19, 2026',
    items: ['On a day before a habit existed, the habit now shows in soft grays (no goal, no ring) under a divider, so you can still see it was not there yet.'],
  },
  {
    version: '2.5.3',
    date: 'November 19, 2026',
    items: ['The menu after pressing and holding now always opens on the left side, so your thumb never covers the options.'],
  },
  {
    version: '2.5.2',
    date: 'November 19, 2026',
    items: ['Edit screens (habit, task, group), the share and parent pickers, Updates and the log sheets now close when you tap anything that is not a button or a field.'],
  },
  {
    version: '2.5.1',
    date: 'November 19, 2026',
    items: ['No more text selection (the copy / look up bar and blue handles) and no pinch zoom anywhere in the app. You can still select text inside text boxes.'],
  },
  {
    version: '2.5',
    date: 'November 19, 2026',
    items: [
      'Press and hold now feels like iOS: the item dips under your finger, lifts with a springy motion, and settles back exactly where it was when you let go (no more small jump).',
      'Haptics: small taps and buzzes when you press, hold, open a menu, finish a habit or task, and switch tabs. On iPhone this needs iOS 17.4 or newer.',
      'Today and Tasks: the arrows, view button and plus button sit a little higher.',
    ],
  },
  {
    version: '2.4',
    date: 'November 19, 2026',
    items: ['Tasks and steps now show the completion percentage of their steps, down through sub-steps. A task with steps is done exactly when all its steps are done; one without steps is simply done or not done.'],
  },
  {
    version: '2.3.1',
    date: 'November 19, 2026',
    items: ['Unfinished tasks now carry over: they stay on Today, marked "Due" with their original day, until you finish them.'],
  },
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
