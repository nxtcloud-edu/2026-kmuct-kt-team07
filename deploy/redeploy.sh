#!/usr/bin/env bash
# Ships the current working tree to the single EC2 host described in
# docs/release-runbook.md: build the AMD64 image, load it on the server, swap the
# app container while keeping its env file and data volume, check health, and put
# the previous container back if the new one does not come up.
#
#   deploy/redeploy.sh release-journey-20260920-1
#
# DEPLOY_HOST  ssh target                (default ec2-user@18.208.163.160)
# DEPLOY_KEY   private key path          (default .data/deploy/ddakpum-aws-key.pem)
# PUBLIC_URL   address checked at the end (default https://<host part of DEPLOY_HOST>)
# SKIP_CHECK=1 skips `npm run check` when it has just been run.
set -euo pipefail

TAG="${1:?사용법: deploy/redeploy.sh <release-tag> (같은 태그를 재사용하지 않습니다)}"
HOST="${DEPLOY_HOST:-ec2-user@18.208.163.160}"
KEY="${DEPLOY_KEY:-.data/deploy/ddakpum-aws-key.pem}"
PUBLIC_URL="${PUBLIC_URL:-https://${HOST#*@}}"
IMAGE="parts-finder:${TAG}"
REMOTE_DIR="/home/ec2-user/ddakpum"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 "$HOST")

cd "$(dirname "$0")/.."
[ -f "$KEY" ] || { echo "개인 키가 없습니다: $KEY" >&2; exit 1; }

echo "== 1/5 서버 접속 확인"
if ! "${SSH[@]}" "test -f $REMOTE_DIR/.env.production && sudo docker inspect ddakpum-app >/dev/null"; then
  cat >&2 <<'EOF'
서버에 접속하지 못했거나 기존 배포를 찾지 못했습니다.
SSH는 보안 그룹에서 관리자 공인 IP /32만 허용합니다. 네트워크가 바뀌었다면
docs/aws-deployment-status.md의 안내대로 22번 규칙의 /32만 현재 IP로 교체하세요.
EOF
  exit 1
fi
if "${SSH[@]}" "sudo docker image inspect $IMAGE >/dev/null 2>&1"; then
  echo "서버에 이미 있는 태그입니다: $IMAGE. 새 태그를 사용하세요." >&2
  exit 1
fi

echo "== 2/5 검증"
[ "${SKIP_CHECK:-}" = "1" ] || npm run check

echo "== 3/5 AMD64 이미지 빌드: $IMAGE"
docker buildx build --platform linux/amd64 -t "$IMAGE" --load .

echo "== 4/5 이미지 전송"
docker save "$IMAGE" | gzip | "${SSH[@]}" "gunzip | sudo docker load"

echo "== 5/5 컨테이너 교체"
"${SSH[@]}" "IMAGE=$IMAGE REMOTE_DIR=$REMOTE_DIR bash -s" <<'REMOTE'
set -euo pipefail
previous=$(sudo docker inspect -f '{{.Config.Image}}' ddakpum-app)
echo "이전 이미지: $previous"
run() {
  sudo docker run -d --name ddakpum-app \
    --env-file "$REMOTE_DIR/.env.production" \
    --memory 768m --stop-timeout 150 \
    -p 127.0.0.1:3001:3001 \
    -v ddakpum-data:/app/.data \
    --restart unless-stopped \
    --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
    "$1" >/dev/null
}
healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -m 3 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
sudo docker stop --time 150 ddakpum-app >/dev/null
sudo docker rename ddakpum-app ddakpum-app-previous
if run "$IMAGE" && healthy; then
  sudo docker rm ddakpum-app-previous >/dev/null
  echo "교체 완료: $IMAGE (되돌릴 이미지: $previous)"
else
  echo "새 컨테이너가 정상 응답하지 않아 이전 컨테이너로 되돌립니다." >&2
  sudo docker logs --tail 30 ddakpum-app >&2 || true
  sudo docker rm -f ddakpum-app >/dev/null 2>&1 || true
  sudo docker rename ddakpum-app-previous ddakpum-app
  sudo docker start ddakpum-app >/dev/null
  exit 1
fi
REMOTE

echo "== 공개 주소 확인: $PUBLIC_URL"
curl -fsS -m 20 "$PUBLIC_URL/api/health"
echo
live=$(curl -fsS -m 20 "$PUBLIC_URL/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
local_bundle=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
echo "공개 번들: $live"
echo "로컬 빌드: $local_bundle (같은 소스면 이름이 같습니다)"
