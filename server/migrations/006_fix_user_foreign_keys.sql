-- 修复用户删除时的外键约束
-- 将引用 users(id) 且未设置删除策略的外键改为 ON DELETE SET NULL
-- 避免删除用户时因关联记录导致数据库错误

BEGIN;

-- messages.sender_id: 发送者删除后，消息保留但发送者置空
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;

-- groups.created_by: 创建者删除后，群组保留但创建者置空
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_created_by_fkey;
ALTER TABLE groups ADD CONSTRAINT groups_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
