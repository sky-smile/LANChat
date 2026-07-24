-- 公司大群：系统默认群组
-- 1. 给 groups 表添加 is_system 标识列
ALTER TABLE groups ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT false;

-- 2. 创建"公司大群"（密码admin123的管理员创建）
INSERT INTO groups (name, description, group_type, max_members, created_by, is_system)
SELECT '公司大群', '全体员工沟通群', 'system', 9999, id, true
FROM users WHERE account = 'admin' LIMIT 1
ON CONFLICT DO NOTHING;

-- 3. 将所有现有用户加入公司大群
INSERT INTO group_members (group_id, user_id, role)
SELECT g.id, u.id, 'member'
FROM groups g, users u
WHERE g.is_system = true AND g.name = '公司大群'
  AND NOT EXISTS (
    SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = u.id
  );

-- 4. 索引
CREATE INDEX idx_groups_is_system ON groups(is_system);
