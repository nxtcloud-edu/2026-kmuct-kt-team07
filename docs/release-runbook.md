# 디자인 확정 후 배포 절차

현재 공개 배포는 대기 중이다. 디자인 작업이 끝난 뒤 아래 순서로 최종 버전을 고정한다. 이 문서의 명령은 배포를 자동으로 실행하는 예약 작업이 아니다.

2026-09-20 준비 결과: 전체 테스트 78개·타입 검사·빌드 통과. 배포 설정 검사는 현재 로컬 설정의 실제 HTTPS Origin과 명시적인 일일 요청 한도만 미완료로 보고했다. 앱의 현재 기본값은 100요청/24시간이며, 운영에서 이 값을 유지할 경우 `AI_DAILY_REQUEST_LIMIT=100`을 명시한다. [설정 검사 결과](../artifacts/release-readiness.json). 비밀 값은 기록하지 않았다.

기존 로컬 운영 이미지로 독립된 컨테이너 교체 검사를 실행해 DB·세션·찾기 기록·중복 방지 유지와 소유권 검사를 통과했다. 검증용 컨테이너와 볼륨은 제거했다. [교체 검사 결과](../artifacts/restart-verification.json). 진행 중인 디자인 최종본에 대한 출시 검증은 디자인 완료 뒤 다시 수행한다.

## 1. 최종 화면과 코드 고정

- 디자인 작업 완료 후 모바일에서 사진 선택·모델명 검색·후보 선택·부품 근거·판매처 이동을 확인한다. 실제 휴대폰 카메라와 사진첩도 확인한다.
- `npm run check`로 현재 코드 전체를 검증한다. 이전 디자인 버전의 통과 기록을 대신 사용하지 않는다.
- 검토한 변경을 커밋하고 배포 버전 이름을 정한다. 진행 중인 디자인 변경을 임의로 커밋하거나 덮어쓰지 않는다.

## 2. 운영 설정 확인

서버에서 `deploy/production.env.example`을 `.env.production`으로 복사하고 파일 권한을 `600`으로 설정한다. 기존 제공 API의 주소·키·모델 ID와 실제 HTTPS `APP_ORIGIN`, `AI_DAILY_REQUEST_LIMIT`를 입력한다. 로컬 개발용 `.env`는 그대로 둔다. API 값은 공유 문서나 명령줄 인자로 복사하지 않는다. 운영 DB는 Compose의 지속 볼륨을 사용한다.

```sh
node --env-file=.env.production --import tsx scripts/release-check.ts
```

검사는 네트워크 요청이나 AI 호출을 하지 않는다. HTTPS Origin, 필수 AI 설정, 명시적인 요청 한도, TLS 검증 설정, 카탈로그, 빌드 파일을 확인하고 공개 번들에 설정된 키·게이트웨이 주소가 있는지 검사한다. 환경 변수 값은 보고서에 남기지 않는다. **통과는 실제 DNS·인증서·공급자 연결 확인을 대신하지 않는다.**

로컬 `.env`의 `http://localhost:3001`은 이 검사를 통과하지 않는 것이 정상이다. 개발용 설정을 임의의 도메인으로 바꿔 통과시키지 않는다.

## 3. 되돌릴 수 있는 이미지 보관

`release-YYYYMMDD-N`은 실제 확정한 버전 이름으로 바꾼다. 같은 태그를 재사용하지 않는다. 이전 운영 이미지의 태그와 ID를 별도로 기록하고 새 버전 검증 전에는 삭제하지 않는다.

```sh
docker build -t parts-finder:release-YYYYMMDD-N .
docker image inspect parts-finder:release-YYYYMMDD-N --format '{{.Id}}'
node --import tsx scripts/verify-restart.ts --run --image=parts-finder:release-YYYYMMDD-N
```

재시작 검증은 루프백 3015와 무작위 이름의 임시 볼륨을 사용한다. 테스트 제품 기록을 만든 뒤 컨테이너를 교체하고 DB·세션·중복 요청 방지·소유권이 유지되는지 검사한다. 실제 운영 DB·API 키는 전달하지 않고 완료 시 테스트 컨테이너와 볼륨만 제거한다. 같은 이미지의 교체 검사이며 DB 스키마가 다른 버전의 복원을 보장하지 않는다.

장기 보관할 자료는 소스 커밋, 검증 보고서, 배포 이미지 ID, `data/catalog.json`과 그 변경 이력이다. 원하면 `docker image save -o <안전한보관경로>/release.tar <확정태그>`로 이미지를 보관한다. **사용자 DB·WAL·임시 사진은 장기 백업에 포함하지 않는다.** 새 서버에서는 빈 사용자 DB로 시작할 수 있다. 기존 사용자의 찾기 기록이 소실될 수 있음을 운영상 고려한다.

## 4. 실제 배포 시 실행

도메인·HTTPS 프록시와 서버가 준비되고 디자인이 확정된 뒤 실행한다. 서버의 `.env.production` 파일 권한은 소유자만 읽을 수 있게 유지한다. `docker compose config` 전체 출력은 키를 포함할 수 있으므로 공유하지 않는다.

```sh
APP_IMAGE=parts-finder:release-YYYYMMDD-N APP_ENV_FILE=.env.production docker compose --env-file .env.production config --quiet
APP_IMAGE=parts-finder:release-YYYYMMDD-N APP_ENV_FILE=.env.production docker compose --env-file .env.production up -d --no-build --pull never
APP_ENV_FILE=.env.production docker compose --env-file .env.production ps
```

프록시는 앱 포트를 외부에 직접 열지 않고 HTTPS에서 루프백 3001로 전달한다. 설정 예시는 [배포 문서](deployment.md)를 따른다. 운영 URL에서 페이지·세션·검색·선택·구매 경로를 확인하고, 공개 테스트 사진 1장으로 제공 API 연결을 확인한다. API 제공자의 사용량 상한과 사진 보관 정책도 실제 계정 설정에서 확인한다.

## 5. 오류 발생 시 복원

먼저 이전 이미지의 로컬 존재 여부를 확인한다. 아래 `previous-release`는 실제 기록한 이전 태그로 바꾼다.

```sh
docker image inspect parts-finder:previous-release --format '{{.Id}}'
APP_IMAGE=parts-finder:previous-release APP_ENV_FILE=.env.production docker compose --env-file .env.production up -d --no-build --pull never
APP_ENV_FILE=.env.production docker compose --env-file .env.production ps
```

동일한 Compose 프로젝트·볼륨을 유지한다. `docker compose down -v`를 사용하지 않는다. 현재까지의 스키마는 동일하지만 향후 DB 스키마를 변경하면 구버전 호환성을 별도 검증해야 한다. 복원 후 건강 상태뿐 아니라 모델 검색과 구매 경로를 다시 확인한다. 사진 요청을 자동 재전송하지 않는다.

Compose 프로젝트명은 `parts-finder`로 고정했다. 한글 작업 폴더에서도 실행할 수 있고, 배포 폴더가 바뀌어도 기본 볼륨 이름이 달라지지 않는다. 별도 `-p` 또는 `COMPOSE_PROJECT_NAME`으로 실행했다면 이후 업데이트·복원에서도 반드시 같은 이름을 사용한다.

## 디자인 완료 후 남는 현장 확인

실제 도메인/DNS/HTTPS, 배포 서버의 제공 API 연결, 실물 휴대폰의 카메라·사진첩, 제공자 사용량·보관 정책. 현재 계정 설정이나 공개 서버를 변경하지 않고 준비할 수 있는 범위와 구분한다.

## 배포 대상이 아직 없는 경우

현재 서버와 도메인은 미정이다. 이 저장소는 Node 서버·SQLite 지속 볼륨이 필요한 단일 인스턴스 웹앱이다. 정적 사이트 호스팅만으로는 실행되지 않는다. Docker 지원 Linux 서버, 지속 디스크, 공개 HTTPS 도메인을 준비한 뒤 위 절차를 진행한다. 서버 아키텍처를 먼저 확인하고 그에 맞는 이미지를 빌드한다. ARM64 준비 이미지를 AMD64 서버용으로 간주하지 않는다.

호스트에서 실행하는 Caddy 설정은 `deploy/Caddyfile`에 있다. `PUBLIC_HOST`에는 실제 호스트명만 지정하고, 앱의 `APP_ORIGIN`은 그 호스트의 HTTPS Origin으로 맞춘다. DNS와 80/443 접근을 준비한 뒤 실제 실행한다. Caddy는 Docker 내부가 아닌 앱과 같은 서버 호스트에서 실행하는 구성이다. 인증서 데이터는 Caddy 서비스의 지속 경로에 보관한다.

```sh
# 실제 호스트명으로 치환. 이 명령은 문법 검증만 한다.
PUBLIC_HOST=parts.example.com caddy validate --config deploy/Caddyfile --adapter caddyfile
```

[공식 환경 변수 문법](https://caddyserver.com/docs/caddyfile/concepts)과 [업로드 제한](https://caddyserver.com/docs/caddyfile/directives/request_body)을 따른다. Caddy 2.10.2 컨테이너로 설정 검증을 수행하되 인증서 발급·DNS 변경은 실행하지 않는다. 앱 로그는 Docker에서 파일당 10MB, 최대 3개로 순환한다.

디자인 진행 중의 준비 이미지는 출시 확정본이 아니다. 최종 디자인 반영 후 테스트·빌드·모바일 이용 흐름 검증을 다시 하고 새로운 이미지 태그로 배포한다. 준비 결과의 파일 해시는 `artifacts/deployment-preparation.json`에 보관한다.

최신 준비 이미지: `parts-finder:prep-catalog470-20260920` (`linux/arm64`), 이미지 ID `sha256:641a8bfd6586d3785a64247b0a632a7366f6921b34a26ef73eacc6ab0bc5243f`. 470개 카탈로그와 테스트 78개, 운영 모드·정적 자산·Linux 이미지 처리·컨테이너 교체 검증 완료. 디자인 완료 전 사본이며 운영 서버·도메인은 미정이다. [전체 준비 기록](../artifacts/deployment-preparation.json).

최종 디자인 반영 후 `parts-finder:release-design-v3-20260920` 이미지와 운영 검증을 완료했다. 해커톤 AWS 버지니아 인증은 정상이나 현재 서버 구성 생성 dry-run이 계정 정책에 의해 거부되어 공개 배포는 보류 중이다. [재개에 필요한 AWS 안내](aws-deployment-status.md).

운영진 PDF 반영: 허용 구성은 t3.small + nxtcloud-ami-v1.0.2 + SafeInstanceProfile-kmuct-ht-07이며 이 구성의 생성 dry-run은 통과했다. 최종 배포 이미지는 `parts-finder:release-design-v3-amd64-20260920`이다. 키 페어·보안 그룹 생성의 구체적 승인을 기다리고 있다. 이전 ARM64/권한 거부 기록보다 [현재 AWS 배포 상태](aws-deployment-status.md)를 우선한다.


## 2026-09-20 공개 AWS 배포 완료

- 서비스: https://18.208.163.160
- 상태와 제한: [AWS 배포 기록](aws-deployment-status.md)
- 서버: `us-east-1` / `i-03c9aea6e1bc82f0a` / `t3.small` / 30GB 암호화 gp3.
- SSH 사용자: `ec2-user`. 전용 개인 키는 프로젝트 `.data/deploy/ddakpum-aws-key.pem` (600); Git/공개 아티팩트에 넣지 않는다.
- 서버 배포 폴더: `/home/ec2-user/ddakpum`; `.env.production` 600.
- 컨테이너: `ddakpum-app`, `ddakpum-caddy`. 앱 데이터 볼륨 `ddakpum-data`, 인증서 볼륨 `ddakpum-caddy-data`와 설정 볼륨 `ddakpum-caddy-config`를 유지한다.
- 이미지: `parts-finder:release-design-v3-amd64-20260920`. 로컬 OCI manifest digest와 서버 Docker config digest는 표현이 다르며, 내보낸 이미지의 config digest가 서버 실행 이미지와 일치함을 검증했다.
- 실행 설정: 앱은 `.env.production`, `--memory 768m`, `--stop-timeout 150`, `127.0.0.1:3001:3001`, `ddakpum-data:/app/.data`; Caddy 2.10.2-alpine은 host network, `PUBLIC_IP`, `deploy/Caddyfile.ip`와 인증서 볼륨을 사용. 두 컨테이너는 `unless-stopped`, 로그 파일 10MB × 3.
- 상태 확인: `sudo docker ps`; `sudo docker logs --tail 50 ddakpum-caddy`; `curl --fail https://18.208.163.160/api/health`.
- 일반 앱 재시작: `sudo docker restart --time 150 ddakpum-app`. 컨테이너 재생성 시 환경 파일과 동일 데이터 볼륨을 반드시 유지한다.
- 프록시 설정 변경: 수정 후 `sudo docker exec ddakpum-caddy caddy validate --config /etc/caddy/Caddyfile`, 이어서 `sudo docker exec ddakpum-caddy caddy reload --config /etc/caddy/Caddyfile`.
- 최초 인증서 발급 및 자동 갱신 설정 확인 완료. 강제 갱신으로 발급 한도를 소모하지 않았다. 이후 갱신 성공 여부는 운영 시 Caddy 로그·인증서 만료일로 확인한다.
- 카탈로그/코드 변경 후에는 `npm run check`와 AMD64 이미지 재빌드, 기존 데이터 볼륨을 유지하는 컨테이너 교체, 공개 HTTPS 기능 확인을 수행한다.
