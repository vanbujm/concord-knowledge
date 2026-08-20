# The Winds poller, containerised so the same image runs on this laptop today and
# on a server later without change. Scheduling stays outside the container: a
# laptop sleeps, and cron inside a container silently drops the runs it misses,
# whereas the host's launchd fires a missed slot once on wake.
#
# Debian-based rather than Alpine on purpose. onnxruntime-node, which backs the
# embedding model used to retrieve wiki background, ships glibc binaries and has no
# musl build.
#
# Pinned by digest, not just by tag. A bare tag makes BuildKit ask the registry to
# resolve it on every build, so two scheduled runs failed outright when Docker Hub
# was briefly unreachable. A digest can be satisfied from the local image.
FROM oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521

WORKDIR /app

# Dependencies first, so a source edit does not invalidate the install layer.
# prisma/ and prisma.config.ts come too, because the postinstall hook runs
# `prisma generate` and needs the schema present.
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# prisma.config.ts resolves DATABASE_URL when it loads, and the postinstall hook
# runs `prisma generate`, so the build needs the variable present even though it
# never connects. An ARG rather than an ENV: it is in scope for the rest of this
# stage but is not baked into the finished image, where the real value arrives at
# run time from --env-file.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN bun install --frozen-lockfile

COPY . .

RUN bunx prisma generate

# The embedding model is ~130MB and is downloaded on first use. Pointing its cache
# at a mounted volume keeps it out of the image and out of every later run.
ENV TRANSFORMERS_CACHE_DIR=/model-cache
VOLUME ["/model-cache"]

# Arguments given to `docker run` are appended, so `--dry-run` and friends work.
ENTRYPOINT ["bun", "run", "discord:poll"]
