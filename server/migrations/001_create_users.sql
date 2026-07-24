-- 用户表
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    department VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' NOT NULL,
    status VARCHAR(20) DEFAULT 'offline',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_account_phone CHECK (account ~ '^1[3-9]\d{9}$')
);

-- 索引
CREATE INDEX idx_users_account ON users(account);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_status ON users(status);
