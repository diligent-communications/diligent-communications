// The addresses host answers on, and the cookie the person's session travels
// in. They are stated here once. The command line reads them from here.

// The address of an operation is this followed by its name.
export const OPERATION_PATH = '/api/';

export const SESSION_COOKIE = 'diligent_session';

// The names a PC answers to by itself. Only there may a session or a
// password travel over a plain `http://` address.
export const THIS_PC: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];
