UPDATE users
SET
  password_hash = 'ecd0fa344061b9473b839dcc1324290a3207b33d0f9e0c6f19d40db830fa2d2e',
  password_salt = '0fa448213324ac08b1d2979a91abdf45'
WHERE email = 'jeyaakash8@gmail.com'
  AND role  = 'admin';
