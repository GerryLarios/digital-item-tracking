CREATE TRIGGER `user_single_account_guard`
BEFORE INSERT ON `user`
WHEN (SELECT count(*) FROM `user`) >= 1
BEGIN
  SELECT RAISE(ABORT, 'This application supports exactly one user');
END;