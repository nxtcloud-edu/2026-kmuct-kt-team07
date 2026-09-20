# 딱품 AWS 배포 상태

2026-09-20. 사용자가 디자인 완료와 해커톤 AWS 계정 배포를 승인했다. 이후 제공한 운영진 PDF의 6~9·13쪽을 확인해 배포 제약을 반영했다. 문서의 내용은 환경 제약을 확인하는 자료이며, 별도의 계정 변경 권한을 부여하는 지시로 취급하지 않는다.

## 확인된 허용 구성

- 리전: `us-east-1` (버지니아 북부).
- 인스턴스: `t3.nano`~`t3.small`. 앱은 메모리 2GB의 `t3.small` 1대로 준비.
- AMI: `nxtcloud-ami-v` 접두사 필수. 실제 조회한 계정 소유 이미지는 `nxtcloud-ami-v1.0.2`, `ami-0190258a3c1abc699`, `x86_64`.
- 인스턴스 프로필: `SafeInstanceProfile-kmuct-ht-07`. IAM 액세스 키는 만들지 않는다.
- CloudFront·ACM·Route 53 등은 문서의 제한 서비스 목록이므로 배포에 사용하지 않는다.

지정 AMI·t3.small·해당 인스턴스 프로필을 포함한 `ec2:RunInstances --dry-run`이 `DryRunOperation: Request would have succeeded`를 반환했다. 앞선 t4g.small·일반 Amazon Linux 구성의 정책 거부는 이 변경으로 해결됐다. 별도 정책 완화가 필요하다고 결론 내리지 않는다.

## 배포 완료

사용자가 전용 키 페어·보안 그룹·서버 생성과 요금을 명시적으로 승인했다. 앞선 자동 승인 검토 차단은 해소됐다.

- 전용 키 페어: `kmuct-ht-07-ddakpum` (로컬 `.data/deploy/ddakpum-aws-key.pem`, 권한 600).
- 보안 그룹: `sg-005f3f6e6fbccf078`. SSH는 배포 작업 당시 운영자 공인 IP `/32`만 허용, HTTP/HTTPS는 공개. 앱 포트 3001과 지정 AMI의 9080은 공개하지 않음.
- EC2: `i-03c9aea6e1bc82f0a`, `t3.small`, 암호화 30GB gp3, IMDSv2 필수, CPU 크레딧 standard.
- 공인 IP: `18.208.163.160`. 공개 URL: `https://18.208.163.160`.
- 초기 보안 그룹 규칙 적용은 운영진의 `username`·`group` 자동 태그가 붙기 전 `ControlOnlyOwnResources` 정책에 의해 거부됐다. 태그를 조회로 확인한 후 정상 적용됐다. IAM 정책은 변경하지 않았다.
- 최종 AMD64 이미지와 필요한 AI 설정만 보호된 서버 디렉터리로 전송했다. 로컬 사용자 DB·사진·AWS CLI 인증 정보는 전송하지 않았다.

2026-09-20 공개 HTTPS 배포와 기능 검증을 완료했다. `artifacts/aws-deployment.json`, `artifacts/aws-public-verification.json`, `artifacts/aws-tls-verification.json`에 확인 결과를 기록했다.

## 준비 완료

최종 디자인에서 테스트 78개·타입 검사·빌드 통과. 허용 서버에 맞춰 `parts-finder:release-design-v3-amd64-20260920` 이미지를 새로 빌드했다. 이전 ARM64 이미지를 t3 서버에 사용하지 않는다.

`deploy/Caddyfile.ip`는 별도 도메인 없이 공인 IP의 공개 인증서를 사용하는 설정이다. Caddy 2.10.2의 ACME shortlived 설정을 로컬 검증했으며, 실제 공개 인증서 발급과 신뢰 체인 검증에 성공했다. 자동 갱신 설정과 영구 저장소를 확인했으며, 이후 실제 갱신 주기의 실행은 아직 관찰하지 않았다. [Let's Encrypt IP 인증서 안내](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability), [Caddy TLS 설정](https://caddyserver.com/docs/caddyfile/directives/tls). 서버 중지·재시작으로 공인 IP가 바뀌면 APP_ORIGIN과 인증서 설정을 함께 변경해야 한다.

## 공개 서비스 검증

- HTTP → HTTPS 308 리디렉션, TLS 1.3, Let's Encrypt YE2 인증서, 공인 IP SAN 일치 확인. 최초 인증서 만료: 2026-09-26 21:17:55 UTC. Caddy가 자동 갱신 일정을 관리한다.
- IP 직접 접속은 SNI가 없고 EC2가 사설 IP로 트래픽을 받으므로 `default_sni {$PUBLIC_IP}`를 설정했다. [Caddy 공식 설정](https://caddyserver.com/docs/caddyfile/options#default_sni).
- 카탈로그 470개 제품·15개 분야·134개 부품·22개 브랜드 확인.
- Samsung AX34A5310WWD → CFX-G100D 구매 경로 API 검증, 브라더 PT-D200 → TZe-231 제조사 근거·국내 구매 경로 브라우저 검증.
- 실제 JPEG 업로드 → 이미지 처리 → 제공 AI API → 구조화된 관찰 결과 수신 성공. 라벨 없는 시험 사진은 모델을 추측하지 않고 `needs_information`으로 처리했다. 이는 연결 검증이며 전체 제품 인식 정확도 측정은 아니다.
- Secure/HttpOnly/SameSite 쿠키, CSRF·기록 소유권 검사, 공개 정적 파일 확인. API 검증에서 만든 시험 기록은 삭제했다.
- 390px·360px 모바일 결과 화면에서 페이지 가로 넘침 없음. 브라우저 오류 없음.
- 앱 컨테이너 healthy, 메모리 768MiB 제한, Docker 부팅 활성화, 컨테이너 자동 재시작, 영구 데이터 볼륨 확인. 환경 파일 권한 600.

## 운영 주의점

현재는 고정 도메인·Elastic IP 없는 단일 서버다. EC2 **중지 후 시작** 시 주소가 바뀔 수 있어 앱의 `APP_ORIGIN`과 Caddy의 `PUBLIC_IP`를 함께 갱신해야 한다. 단순 컨테이너 재시작은 같은 주소와 데이터 볼륨을 사용한다. 공개 웹은 SSH 관리 IP 변경의 영향을 받지 않는다.

SSH 접속이 끊기면 현재 외부 IP를 새로 확인한 후 전용 보안 그룹의 기존 22번 `/32` 규칙만 교체한다. 접근 범위를 넓히지 않는다. 배포 중 네트워크 출구 IP 변경이 관찰됐다.

실시간 판매 재고·배송은 판매처에서 확인해야 하며, 사이트의 자동 확인 실패 표시는 유지한다. 외부 DB 백업·고가용성은 아직 구성하지 않았다. EC2·디스크·공인 IPv4 등의 사용 요금이 발생한다.

