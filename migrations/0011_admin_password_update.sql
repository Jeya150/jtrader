UPDATE users
SET
  password_hash = 'f38a1ddcd802665fcf1c5be9244759790cc8af03cac00e5c6de110b6ad876cde',
  password_salt = '94fd388b1a8b0814ce8b3396634ca659'
WHERE email = 'jeyaakash8@gmail.com'
  AND role  = 'admin';
