# 딱맞는부품

사진으로 내 물건에 필요한 부품을 찾고, 정품부터 대체품까지 구할 수 있는 경로와 확인 근거를 안내하는 한국어 웹 앱입니다. 현재는 물병·텀블러를 대상으로 합니다.

React + Vite 화면, Express 서버, SQLite 작업 큐·개인 기록, 제공받은 AI API 연결까지 구현했습니다. 외부 배포는 하지 않았습니다.

## 바로 실행

Node 22.17.1 이상을 사용합니다. 로컬 `.env`의 기존 값을 유지합니다.

```sh
npm ci
npm run check
npm start
# 브라우저: http://localhost:3001
```

```dotenv
AI_API_BASE_URL=https://your-gateway.example/v1
AI_API_KEY=your-issued-key
AI_MODEL=your-provided-model
```

키는 서버에서만 읽습니다. `.env`와 `.data`는 Git·Docker 컨텍스트에서 제외됩니다. 앱은 제공 API의 OpenAI 호환 Chat Completions를 사용하고 AWS Bedrock을 직접 호출하지 않습니다.

- 화면 개발: `npm run dev` → `http://localhost:5173`
- 배포용 빌드: `npm run build`
- 컴파일된 서버 로컬 실행: `npm run start:production`
- 운영 환경 설정·Docker·HTTPS: [배포 안내](docs/deployment.md)
- Google에서 준비한 제품 사진으로 시연: [시연 가이드](docs/demo.md)
- 구현 범위와 원래 제안의 차이: [구현 결정](docs/implementation-decisions.md)
- 요구사항 및 범위: [제품 범위](docs/product-scope.md)

## 구현된 흐름

1. 사진 1~4장(전체·부품·라벨) 또는 모델명으로 시작합니다. 서버에서 사진을 디코딩하고 EXIF 제거·회전·축소를 수행합니다.
2. AI는 관찰 전용 도구 하나만 호출합니다. 자유 텍스트는 버리고 Zod 검증 실패 시 한 번 재시도합니다.
3. OCR 원문은 보존하고 비교용으로만 대소문자·공백·하이픈을 정규화합니다. 불확실한 O/0, I/1, S/5는 모든 동등 조합과 카탈로그 별칭을 비교합니다.
4. 모델·용량 후보를 사용자가 공식 제품 정보와 대조해 선택합니다. 하나의 후보라도 자동 호환 확정하지 않습니다.
5. 정품·타사 대체품, 범용 규격 확인, 중고 검색, 제조사 문의 경로를 표시합니다. 근거 주체·확인 날짜·조건·적용 제외·상충을 구분하고 재고와 호환 판단을 분리합니다.
6. 최근 찾기, 문의 초안 복사, 확인 항목 저장, JSON 내보내기, 미검증 개인 장착 기록을 지원합니다. 기록은 이 브라우저 세션에만 연결되며 최대 24시간 보관합니다.

## 실제 카탈로그

`data/catalog.json`에 **제품 52개, 부품 46개, 판매 항목 46개, 적용 근거 101개**를 수록했습니다.

- 써모스 국내 모델 16개: JNL 5종, JNR 시즌3 3종, FHL 2종, JOS 3종, JOW 3종. 마개·패킹·빨대의 국내 공식몰 구매 경로 및 용량별 옵션 안내.
- 킨토 국내 모델 17개: 워터보틀·워터텀블러·엑티브 보틀/텀블러·플러그 투고·플레이·워크아웃·투고 보틀·트레일 텀블러. 국내 판매처의 부품 20개와 용량별 빨대·패킹·캡 안내.
- 조지루시 국내 모델 15개: SU-BA·SM-VH·SM-VS·SM-VB·SX-JS·SM-RS. 공식 부품 4개와 전체 모델 코드별 적용 목록.
- Nalgene Wide Mouth 16oz·32oz·48oz: 공식 제품과 용량별 정품 캡.
- Hydro Flask Wide Mouth 32oz: 공식 Flex Cap.
- humangear capCAP+: 대체 부품 제조사의 적용 설명과 세부 버전 확인 조건.
- 구형 capCAP: 공식 판매 종료와 Hydro Flask 적용 제외 근거.

자료가 없는 모델·손잡이 단품 등은 상품을 지어내지 않고 규격 확인·검색·문의로 안내합니다. 범용·중고 검색 링크는 `검색 결과`로 표시하며 검증된 상품처럼 보여주지 않습니다. 웹 전체를 실시간으로 수집하는 기능은 없습니다.

사진 없이 **등록 제품 둘러보기**에서 브랜드·용량·부품 종류·국내 구매 경로로 필터링할 수 있습니다. 검색은 한글/영문 별칭·공백·하이픈을 처리하며, OCR 판정은 별도 정확 일치 규칙을 유지합니다.

써모스·킨토·조지루시의 국내 판매 경로를 확인했습니다. 킨토의 근거 주체는 국내 판매처로 표시합니다. 옵션별 재고·최종 가격은 판매 페이지에서 확인해야 합니다. Nalgene·Hydro Flask·humangear는 해외 경로이며 국내 배송은 미확인입니다. 링크 검사 99개 중 96개 HTTP 200, Hydro Flask 제품·캡·문의 3개는 HTTP 403입니다. 킨토 빨대·캡·패킹 4개 판매 항목은 확인 당시 품절로 구분합니다. [링크 검사 기록](artifacts/catalog-links.json)

```sh
npm run catalog:validate
npm run catalog:links
npm run catalog:import -- /absolute/path/catalog.json
```

가져오기는 스키마·중복 ID·참조 무결성을 검사한 뒤 카탈로그를 교체합니다. 적용하려면 서버를 재시작합니다. 링크 검사는 등록한 허용 도메인만 요청하며 HTTP 성공을 호환 확인이나 재고 확인으로 승격하지 않습니다. 의미 검수는 [카탈로그 관리 안내](docs/catalog.md)를 따릅니다.

## 검증

- `npm test`: 관찰 계약·게이트웨이·근거 판정·HTTP 서버·카탈로그 검색 테스트 56개 통과. 자동 테스트에서 유료 AI를 호출하지 않습니다.
- `npm run build`: 서버/클라이언트 타입 검사 및 배포용 빌드 통과.
- 실제 제공 API: 공개 물병 사진 분석 성공. 웹 화면의 대기 → 관찰 결과 → 제품 확인 흐름도 실제 연결로 확인했습니다.
- Chrome 데스크톱과 360px/390px 모바일에서 제품 선택·근거 표시·규격 저장을 확인했습니다.
- 런타임 의존성 `npm audit --omit=dev`: 알려진 취약점 0개(2026-09-20 검사).
- Docker 이미지 빌드·운영 모드 로컬 기동·SQLite·Secure 쿠키·Linux 이미지 처리까지 통과했습니다. [컨테이너 검증](artifacts/container-verification.json)

실제 공급자 연결을 별도로 재검사할 때만 `npm run smoke:ai`를 실행하세요. 사용량이 발생합니다. [최초 실제 호출 기록](artifacts/ai-smoke-2026-09-20T02-29-33-150Z.json)은 HTTP 200, 약 7초, 입력 2,791/출력 423토큰, 도구 1회와 재시도 없음을 기록했습니다. 이는 연결 확인이며 인식 정확도를 입증하는 평가셋이 아닙니다.

실물 장착·누수·내열·내구성 검증은 수행하지 않았습니다. 장착 기록은 미검증 개인 기록으로 저장하고 공개 호환 근거에 자동 반영하지 않습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `client/` | 사진·모델명 찾기, 제품 확인, 근거·해결 경로, 최근 기록 UI |
| `server/app.ts` | HTTP API, 소유권·CSRF·한도, 작업 실행 |
| `server/store.ts` | SQLite 큐·세션·보관 기간·개인 기록 |
| `server/images.ts` | 이미지 실제 형식·픽셀 검사 및 정규화 |
| `server/resolver.ts` | 적용/제외/상충/미확인 판정과 검색·문의 경로 |
| `shared/domain.ts` | 제품·부품·판매·근거 계약과 부품별 확인 항목 |
| `src/gateway.ts` | 제공 AI API의 이미지 입력·도구 호출 어댑터 |
| `src/analysis.ts`, `observation.ts`, `catalog.ts`, `prompt.ts` | 관찰 검증·OCR 비교·관찰 전용 프롬프트 |
| `data/catalog.json` | 출처를 확인한 초기 카탈로그 |
| `tests/` | 관찰·서버·근거 판정 테스트와 공개 예제 사진 |

[사진 출처·라이선스](tests/fixtures/ATTRIBUTION.md). 사용하지 않는 기존 Bedrock 어댑터는 `src/bedrock.ts`와 [이전 연결 기록](docs/bedrock-legacy.md)에 보존했습니다.


## 사진·구매·모바일 개선

라벨 해상도 보존, 브랜드·용량 참고 후보, 재촬영 안내, 모바일 촬영/라벨 추가 버튼, 최근 국내 주문 가능 필터를 적용했습니다. 주문 상태는 24시간 후 재확인으로 전환합니다. 실제 API의 합성 라벨 2장·공개 사진 1장 검증은 통과했지만 실사용 정확도 수치로 일반화하지 않습니다. [변경과 검증 범위](docs/photo-purchase-mobile.md)
