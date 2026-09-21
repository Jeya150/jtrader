-- Rotate the administrator password.
-- The hash/salt in migrations 0004, 0007, 0011 and 0012 were published to a
-- public GitHub repository, so those credentials must be considered burned.
-- PBKDF2-SHA256, 100000 iterations, 256-bit — matches pw() in src/lib/course.server.ts.
UPDATE users
SET
  password_hash = '6bd55e1eeb26242b611adaf237971203d073974ffdc80eec66e5f1c84d50e5f7',
  password_salt = '983ae054135e20a69f94b9366369de71'
WHERE email = 'jeyaakash8@gmail.com'
  AND role  = 'admin';
