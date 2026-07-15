# 阶段1：构建
FROM rust:1.80-bookworm as builder

WORKDIR /app

# 复制依赖文件
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/

# 构建发布版本
RUN cargo build --release --bin lanchat-api

# 阶段2：运行
FROM debian:bookworm-slim

# 安装 CA 证书
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN useradd -r -s /bin/false lanchat

# 复制二进制文件
COPY --from=builder /app/target/release/lanchat-api /usr/local/bin/

# 切换用户
USER lanchat

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["lanchat-api"]
