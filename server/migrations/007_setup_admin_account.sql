-- 设置超级管理员账户
-- 移除手机号格式约束（允许admin等非手机号账户）
-- 创建默认超级管理员账户（密码：admin123）

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_account_phone;

-- 创建默认超级管理员账户
INSERT INTO users (account, password_hash, name, department, role)
VALUES ('admin', '$argon2id$v=19$m=19456,t=2,p=1$3/Un2pYZw5PeEz38I6bA5A$ulILeKlJ9PuWdzFU7ds25QZ2hiQU2oKS3gKtUvq18Eg', '超级管理员', '系统', 'admin')
ON CONFLICT (account) DO NOTHING;
