// «Kundekontakt» choices — shared by the server action and the form.
export const CONTACT_CHANNELS = ['telefon', 'e-post', 'møte', 'LinkedIn', 'annet'] as const;
export const CONTACT_OUTCOMES = [
  'snakket med',
  'ikke svar',
  'la igjen beskjed',
  'ring tilbake',
  'avtalt møte',
  'ikke interessert',
  'feil person / nummer',
] as const;
