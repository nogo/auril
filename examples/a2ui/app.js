// An A2UI surface as an agent would send it: a booking form with a picker,
// a date, a slider, tabs and a modal. The page shows each action it fires.
import { BASIC_CATALOG } from '../../kit/a2ui.js';

const messages = [
  { version: '1.0', createSurface: {
    surfaceId: 'booking', catalogId: BASIC_CATALOG,
    dataModel: { form: { name: '', table: ['window'], date: '2026-12-04', guests: 2, notes: '', vegan: false }, menu: [{ dish: 'Soup', price: 6.5 }, { dish: 'Risotto', price: 14 }] },
    components: [
      { id: 'root', component: 'Card', child: 'body' },
      { id: 'body', component: 'Column', children: ['title', 'tabs'] },
      { id: 'title', component: 'Text', text: '## Book a table\nFriday evenings fill up **fast**.' },
      { id: 'tabs', component: 'Tabs', tabs: [{ title: 'Booking', child: 'form' }, { title: 'Menu', child: 'menu' }] },
      { id: 'form', component: 'Column', children: ['name', 'when', 'guests', 'table', 'vegan', 'actions'] },
      { id: 'name', component: 'TextField', label: 'Name', value: { '@path': '/form/name' }, placeholder: 'Ada Lovelace',
        '@checks': [{ condition: { '@call': 'required', args: { value: { '@path': '/form/name' } } }, message: 'Who is the table for?' }] },
      { id: 'when', component: 'DateTimeInput', label: 'Date', value: { '@path': '/form/date' }, enableDate: true },
      { id: 'guests', component: 'Slider', label: 'Guests', value: { '@path': '/form/guests' }, min: 1, max: 8, steps: 7 },
      { id: 'table', component: 'ChoicePicker', label: 'Seat', displayStyle: 'chips', value: { '@path': '/form/table' },
        options: [{ label: 'Window', value: 'window' }, { label: 'Bar', value: 'bar' }, { label: 'Garden', value: 'garden' }] },
      { id: 'vegan', component: 'CheckBox', label: 'Vegan menu', value: { '@path': '/form/vegan' } },
      { id: 'actions', component: 'Row', justify: 'end', children: ['details', 'book'] },
      { id: 'details', component: 'Modal', trigger: 'details_button', content: 'details_text' },
      { id: 'details_button', component: 'Button', variant: 'borderless', child: 'details_label', action: { event: { name: 'noop' } } },
      { id: 'details_label', component: 'Text', text: 'House rules' },
      { id: 'details_text', component: 'Text', text: 'Tables are held for **15 minutes**.\n\n- No dogs\n- Cash or card' },
      { id: 'book', component: 'Button', variant: 'primary', child: 'book_row',
        '@checks': [{ condition: { '@call': 'required', args: { value: { '@path': '/form/name' } } } }],
        action: { event: { name: 'book', context: { form: { '@path': '/form' } } } } },
      { id: 'book_row', component: 'Row', align: 'center', children: ['book_icon', 'book_label'] },
      { id: 'book_icon', component: 'Icon', name: 'calendarToday' },
      { id: 'book_label', component: 'Text', text: { '@call': 'formatString', args: { value: 'Book for ${/form/guests} ${pluralize(value: /form/guests, one: "guest", other: "guests")}' } } },
      { id: 'menu', component: 'List', children: { path: '/menu', componentId: 'dish' } },
      { id: 'dish', component: 'Row', justify: 'spaceBetween', children: ['dish_name', 'dish_price'] },
      { id: 'dish_name', component: 'Text', text: { '@path': 'dish' } },
      { id: 'dish_price', component: 'Text', text: { '@call': 'formatCurrency', args: { value: { '@path': 'price' }, currency: 'EUR' } } },
    ],
  } },
];

const el = /** @type {import('../../kit/a2ui.js').A2uiSurface} */ (document.getElementById('booking'));
for (const m of messages) el.apply(m);
el.addEventListener('a2ui-action', (e) => {
  /** @type {HTMLElement} */ (document.getElementById('sent')).textContent = JSON.stringify(/** @type {CustomEvent} */ (e).detail, null, 2);
});
