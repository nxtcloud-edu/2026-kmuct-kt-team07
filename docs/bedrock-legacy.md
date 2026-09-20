> 이전 Bedrock 직접 연결 기록입니다. 현재 연결은 루트 README의 AI 게이트웨이를 사용합니다.

# 사진 관찰 — Bedrock Converse

사용자가 제공한 SYSTEM/TOOL 명세를 구현한 서버용 TypeScript 모듈입니다. 사진 관찰과 모델명 카탈로그 후보 검색까지만 담당하며 호환성 판정·부품 추천·판매 링크 생성은 하지 않습니다.

## 실행

```sh
npm ci
npm run typecheck
npm test
```

Node.js 22 이상이 필요합니다. `.env.example`의 환경변수를 실행 환경에 설정하세요. 이 모듈은 `.env`를 자동 로드하지 않습니다. AWS SDK 기본 credential provider chain을 사용하며 자격 증명을 코드에 넣지 않습니다.

## 서버·작업자에서 연결

```ts
import { createBedrockObservationProvider } from "./src/index.js";

const { provider, destroy } = createBedrockObservationProvider({
  region: process.env.AWS_REGION!,
  modelId: process.env.BEDROCK_MODEL_ID!,
});

try {
  const result = await provider.analyze({
    images: [
      { imageId: "full-1", role: "full", format: "jpeg", bytes: normalizedFullImage },
      { imageId: "label-1", role: "label", format: "png", bytes: normalizedLabelImage },
    ],
    allowedCategoryKeys: categoriesFromCatalog.map(category => category.key),
  }, variantsFromCatalog);
  // result를 해당 요청의 분석 결과로 저장합니다.
} finally {
  destroy(); // 장기 실행 작업자에서는 프로세스 종료 시 한 번 호출합니다.
}
```

예시의 이미지와 카탈로그 변수는 호출자가 공급합니다. 카탈로그 제품 변형은 `variantId`, `modelName`, `aliases`, `capacity`, `generation`을 가집니다. 용량·세대 미등록 값은 `null`입니다. 카테고리와 카탈로그는 서버의 검수된 저장소에서 가져와야 합니다. 브라우저 요청에서 직접 받아 신뢰하지 않습니다.

입력 이미지는 상위 업로드 파이프라인에서 소유권 검사, 실제 이미지 디코딩, EXIF 제거, 회전·리사이즈를 끝낸 바이트여야 합니다. 모듈은 1~4장, JPEG/PNG/WebP, 장당 3,750,000바이트 이하, 사진 ID 중복 여부를 검사합니다. 이미지 형식의 실제 디코딩과 픽셀 크기 검사는 이 모듈 밖의 책임입니다.

## 처리 계약

- SYSTEM은 시스템 메시지로 보내고 사진마다 ID·역할 메타데이터를 붙입니다.
- TOOL을 `toolConfig.tools: [{ toolSpec: ... }]`로 감싸고 `toolChoice: { tool: { name: "record_observation" } }`를 강제합니다.
- 도구 이름·호출 수·완료 사유를 검사한 뒤 Zod로 검증합니다. 자유 텍스트는 버립니다. 모든 객체는 추가 키를 거부합니다.
- 계약 위반은 원래 사진으로 1회 재시도합니다. 잘못된 모델 응답은 다음 프롬프트에 다시 넣지 않습니다. 두 번 실패하면 `needs_information / invalid_model_output`과 `모델명으로 찾기`를 반환합니다.
- AWS 오류·타임아웃은 `needs_information / provider_error`로 전환합니다. SDK 자동 재시도를 끄고 호출당 기본 30초 제한을 둡니다. 로컬 입력 오류는 호출 전에 Zod 오류로 알립니다.
- 허용되지 않은 categoryKey를 제거합니다. 외부 imageId는 각 필드에서 제거하고, 유효한 사진 근거가 사라진 카테고리 후보도 제거합니다. 카테고리가 없으면 `unknownFields`에 `category`를 추가합니다.
- 모델명 원문을 보존하고 비교값에서만 공백·대소문자·하이픈을 정규화합니다. 정규화 충돌도 후보를 모두 남깁니다.
- `uncertain`이면 O/0, I/1, S/5의 모든 조합에 해당하는 카탈로그 별칭을 비교합니다. 동치 서명 방식으로 같은 결과를 계산하므로 최대 2^60개 문자열을 생성하지 않으며 후보 수를 임의로 자르지 않습니다.
- 두 제품 변형 이상이면 `needs_information / ambiguous_model`과 카탈로그 용량·세대 기반 버튼 데이터를 반환합니다. UI는 `question.options`를 렌더링하고 `allowUnknown`에 따라 모름 선택을 제공합니다. 버튼 UI 자체는 포함하지 않습니다.
- 일치 없음은 `needs_information / model_not_found`입니다. 하나가 남은 `observed`도 카탈로그 후보라는 의미이며 호환 확정이 아닙니다. `unknownFields`를 카탈로그 값으로 채우지 않습니다.

선택된 variantId는 후속 API에서 해당 요청의 후보 목록에 속하는지 다시 검증해야 합니다. 사용자 선택 처리·호환 판정은 다음 단계의 책임입니다.

## 검증 범위

테스트는 가상 카탈로그와 모의 Converse 응답으로 출력 검증, 요청 구성, OCR 비교, 참조 제거, 모호성, 실패 전환을 확인합니다. 실제 AWS 인증과 API 요청은 실행했지만, 모델 호출은 IAM 권한 부족으로 거부되었습니다. 사진 인식 정확도·개인정보 검출 성능은 검증하지 않았습니다. Zod는 출력 구조를 검증하며 자유 문자열 안의 추측·개인정보·추천 문구를 의미적으로 차단하는 장치는 아닙니다. 제공된 관찰 규칙은 SYSTEM에 포함했고, 출시 전 실제 사진 평가가 필요합니다.

AWS 안내 PDF는 리전·인증 방식 확인에 참고했습니다. 비밀번호·액세스 키는 코드에 저장하지 않았으며, 사용자가 로그인한 콘솔 계정의 임시 세션을 `bedrock-hackathon` 프로파일로 연결했습니다. 기존 기본 프로파일은 보존했습니다.

## 실제 AWS 연결 테스트

`scripts/smoke-bedrock.ts`는 공개 라이선스의 물병 사진 한 장을 실제 Bedrock에 전달하고 도구 호출·Zod 검증·후처리 결과를 검사합니다. 사진 출처와 변경 내역은 `tests/fixtures/ATTRIBUTION.md`에 있습니다. 호출 시 AWS 사용량이 발생하며 일반 `npm test`에서는 실행되지 않습니다.

```sh
# 사진과 입력 구성만 확인: AWS 호출 없음
npm run smoke:bedrock -- --check-input

# 기존 콘솔 계정으로 임시 세션 인증
aws login --profile bedrock-hackathon --region us-east-1
aws sts get-caller-identity --profile bedrock-hackathon --region us-east-1

# 접근 권한을 확인한 모델 ID로 실제 호출
AWS_PROFILE=bedrock-hackathon AWS_REGION=us-east-1 BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0 npm run smoke:bedrock
```

위 Nova Lite 추론 프로파일은 실제 목록에서 ACTIVE 상태를 확인했습니다. 현재 계정의 호출 권한은 부족합니다. 이름 있는 프로파일은 `AWS_PROFILE`로 지정할 수 있습니다. 테스트 명령은 `.env`가 있으면 읽고, 라이브러리 자체는 환경 파일을 읽지 않습니다. 로컬 `.env`에는 프로파일·리전·모델 ID만 저장되어 있으며, 권한이 반영되면 `npm run smoke:bedrock`으로 재실행할 수 있습니다.

결과는 `artifacts/bedrock-smoke-<timestamp>.json`에 저장합니다. HTTP 상태, AWS 요청 ID, 토큰 수, 지연, 도구 호출 수, Zod 성공 여부, 공개 사진의 검증된 관찰 결과를 기록합니다. 자격 증명·이미지 바이트·자유 텍스트·원시 오류 메시지는 기록하지 않습니다.

통과 기준은 실제 응답에서 `record_observation` 도구 호출 하나를 받아 Zod 검증과 후처리가 끝나는 것입니다. 테스트 카탈로그는 비어 있으므로 `needs_information / model_not_found`가 나와도 관찰 결과가 유효하면 연결 테스트는 통과입니다. 제품 인식 정확도나 호환성은 이 테스트로 검증하지 않습니다.

진행 상태(2026-09-20): 입력 확인·타입 검사·모의 응답 테스트 16개 통과. 콘솔 재로그인, CLI/SDK 임시 인증, STS 신원 조회, Bedrock 모델 목록·가용성 조회 완료. Nova Lite 추론 프로파일·직접 호출과 Claude Haiku 추론 프로파일 호출 모두 HTTP 403으로 거부되었습니다. 실제 도구 응답·Zod 검증 완료 여부는 아직 미검증입니다. [관리자 권한 요청](bedrock-access-request.md)에 오류와 필요한 리소스를 정리했습니다. 액세스 키 생성과 IAM 정책 변경은 수행하지 않았습니다.

공식 API 참고: [ToolSpecification](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolSpecification.html), [ToolChoice](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolChoice.html), [Converse](https://docs.aws.amazon.com/cli/latest/reference/bedrock-runtime/converse.html), [Zod JSON Schema](https://zod.dev/json-schema).
