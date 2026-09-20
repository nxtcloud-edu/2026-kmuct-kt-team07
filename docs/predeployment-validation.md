# 배포 전 검증 — 2026-09-20

현재 로컬 웹앱은 **13개 분야, 20개 브랜드, 405개 제품·적용 계열, 111개 부품, 111개 판매 항목, 487개 적용·제외 근거**다. 물병 외 제품·계열은 208개다. 공개 배포는 하지 않았다.

## 사진에서 구매 경로까지

공식 제품 사진 7장을 눈으로 먼저 확인하고 정답 조건을 정했다. AI 입력에는 이미지 바이트와 임의 사진 ID만 넣었다. 파일명, 상품 페이지 제목, URL, 카탈로그 정답은 보내지 않았다. 제조사 사진은 로컬 평가에만 사용하며 웹앱 예제나 배포 이미지에 포함하지 않는다.

| 사진 | 기대 동작 | 최종 결과 |
|---|---|---|
| 시마노 브레이크 앞면 | SHIMANO는 읽되 보이지 않는 BR 코드는 추측하지 않음 | 통과 |
| OLFA 커터 앞면 | 브랜드만 읽고 PL-1을 추측하지 않음 | 통과 |
| Tombow MONO zero | 브랜드·제품군을 읽되 EH-KUR 형태를 확정하지 않음 | 통과 |
| IKEA 책장 전체 | 외형만으로 BILLY·규격 확정하지 않음 | 통과 |
| Dyson 리모컨 앞면 | 외형만으로 모델 코드 확정하지 않음 | 통과 |
| OLFA 실제 포장 | 인쇄된 OLFA·PL-1로 정확한 후보 제공 | 통과 |
| OLFA 커터 뒷면 | 스티커 번호를 PL-1으로 바꾸지 않음 | 통과 |

첫 검사에서 포장 문구를 12개보다 많이 추출해 스키마 검증과 재시도 모두 실패했다. 프롬프트에 항목 수, 필수 imageIds 배열, 브랜드·모델 코드 우선순위를 명시한 뒤 같은 7개 사진을 재검사해 모두 통과했다. 이는 작은 기능 검사이며 실사용 정확도 100% 또는 정확도 향상률이 아니다.

- [수정 전](../artifacts/real-photo-evaluation/before-report.json), [최종 결과](../artifacts/real-photo-evaluation/report.json)
- 실제 앱의 multipart 업로드 → 실제 AI → 명시적 제품 선택 → OLFA LB-10B 국내 판매 경로도 통과했다. [통합 기록](../artifacts/live-upload-verification.json)
- 원본/정규화 사진을 공개 자료로 재배포하지 않는다. 출처와 해시만 평가 보고서에 기록한다.

## 국내 부품 보강과 구매 검수

- 삼성 공식 CFX-G100D 적용 목록의 AX 모델 28개. 필터 자체 코드는 제품 수에 넣지 않았다. [공식 자료](https://www.samsungsvc.co.kr/shop/product/0000011344)
- LG ADQ75133532 적용 목록의 AS/FS 모델 73개. `.AKOR`와 `.AKORR`는 별도 변형이며 접미 코드 없는 공통 모델명은 선택지로 남긴다. PFPCBA01은 메인 집진 필터를 대체하는 세트가 아니라 메인 필터에 붙이는 특화필터 2개입이다. [공식 자료](https://www.lge.co.kr/care-accessories/aero-tower-furniture/adq75133532)
- IKEA BESTÅ 조합 3개에 공식 구성품 경첩과 색상별 선반을 연결했다. BILLY로 호환 범위를 넓히지 않았다. 일반 카테고리로 이동되는 HJÄLPA 상품 주소는 구매 링크에 추가하지 않았다.
- 판매 URL 109개를 확인했다. 105개 접근 가능, 4개 접근 제한. HTTP 200은 상품·재고 확인을 뜻하지 않는다. [링크 검사](../artifacts/purchase-link-review.json)
- 삼성·LG 두 상품은 브라우저에서 정확한 옵션, 국내 배송 안내, 활성 구매 버튼을 확인했다. 주문 버튼을 누르거나 결제하지 않았다. 확인 당시 주문 가능 표시는 24시간 후 미확인으로 만료된다. [내용 검수](../artifacts/purchase-content-review.json)
- 링크 오류·이동·접근 제한은 재고·호환 상태와 따로 저장한다. 오류/이동 링크는 국내 구매 가능 필터에서 제외하고 직접 구매 버튼 대신 다른 경로로 안내한다.

## 느린 연결과 모바일

- API 요청과 응답 본문 읽기에 45초 제한을 적용했다. 실패한 등록 요청은 자동으로 재전송하지 않는다. 기존 입력과 중복 방지 키를 유지한다.
- 결과 조회는 동시에 한 번만 실행하고 오류 시 간격을 늘린다. 복구되면 안내가 사라지고 결과를 계속 표시한다. 기록이 없거나 세션이 만료되면 무한 조회를 멈춘다.
- 첫 연결 실패 시 입력을 지우지 않고 연결을 다시 확인할 수 있다.
- 모바일 360px에서 삼성 모델 검색·제품 선택·필터 구매 경로를 확인하고, 320px에서도 가로 넘침이 없음을 확인했다. 입력 글자는 16px, 입력 높이는 약 52px다. [화면 검수](../artifacts/predeployment-mobile-verification.json) 가로 넘침 없이 옵션, 주문 확인 시각과 근거가 표시된다.
- 자동 브라우저 파일 선택은 Chrome 확장 프로그램의 파일 URL 권한으로 차단되었다. 서버 multipart 업로드는 실제 파일로 검증했다. 실물 휴대폰의 카메라·사진첩, 실제 이동통신망 테스트는 아직 수행하지 않았다.

## 운영 모드

`npm run check`: 자동 테스트 **72개**와 타입 검사·서버/클라이언트 빌드 통과. 네트워크 지연, 타임아웃, 복구, 폴링 중복 방지, 모델 접미 코드, 교차 가구 부품 제외, 끊어진 구매 링크 처리 검사를 포함한다.

Docker 이미지를 새로 빌드해 루프백 3014에서 운영 모드로 실행했다. Secure/HttpOnly/SameSite 쿠키, CSP/HSTS, Origin·CSRF, 요청 소유권, SQLite 쓰기/읽기, 확장 카탈로그의 구매 경로를 확인했다. 일반 사용자 실행, `.env` 미포함, Linux Sharp 이미지 디코딩도 확인했다. 공개 빌드에 설정된 AI 키와 게이트웨이 주소가 없는지 검사했다. [운영 검사](../artifacts/production-preflight.json)

반복 실행 도구:

```sh
npm run check
node --import tsx scripts/check-purchases.ts
# 검토 후 npm run catalog:import -- /tmp/catalog-purchase-check.json
node --env-file-if-exists=.env --import tsx scripts/evaluate-real-photos.ts --live
# 로컬 운영 모드 컨테이너 3014, APP_ORIGIN=https://parts-preflight.example 기동 후
node --import tsx scripts/preflight-local.ts --run --container=실제검증컨테이너이름
```

외부 배포 때 남는 환경 작업은 실제 도메인·HTTPS, 운영 API 사용량/보관 정책 설정, 배포 서버에서 제공 API 연결 확인이다. 직접 장착·제품 안전·실시간 재고를 검증한 결과는 아니다.

추가 배포 준비 검증: 470개 제품 카탈로그와 디자인 진행 중의 사본으로 테스트 78개·빌드·운영 컨테이너·정적 자산·재시작 검증을 완료했다. 위 405개 시점의 사진·화면 검증과 구분하며, 최종 디자인의 검증을 대신하지 않는다. [최신 준비 기록](../artifacts/deployment-preparation.json).
