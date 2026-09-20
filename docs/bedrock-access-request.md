# Bedrock 연결 테스트 — 권한 요청

2026-09-20 11:05~11:08 KST에 실제 요청을 실행했습니다. 인증 성공 후 모델 호출 권한에서 차단되어 연결 테스트는 아직 통과하지 못했습니다.

## 확인한 내용

- 사용자: `kmuct-ht-07`, AWS 프로파일: `bedrock-hackathon`.
- 리전: `us-east-1`.
- STS 신원 조회, Bedrock 추론 프로파일 목록 조회 성공.
- Nova Lite: 모델 가용성의 authorizationStatus는 AUTHORIZED, agreement/entitlement/region은 AVAILABLE.
- `us.amazon.nova-lite-v1:0`: ACTIVE. 그러나 Converse 요청은 HTTP 403 `AccessDeniedException`.
- 오류 이유: 해당 inference-profile에 대한 `bedrock:InvokeModel`을 허용하는 identity-based policy가 없음.
- `amazon.nova-lite-v1:0` 직접 호출과 `us.anthropic.claude-3-haiku-20240307-v1:0` 호출도 HTTP 403.
- 지정된 `SafeRole-kmuct-ht-07` 역할의 조회는 IAMBasicAccess 정책의 명시적 거부로 차단됨. 역할 존재 여부와 실행 권한은 확인하지 못했으며 역할 전환이나 정책 변경을 하지 않음.

## 관리자에게 전달할 문구

> 해커톤 계정 kmuct-ht-07에서 생활용품 사진 관찰용 Bedrock Converse 연결을 테스트하고 있습니다. 콘솔 로그인·STS·모델 목록 및 가용성 조회는 성공하지만 us-east-1의 us.amazon.nova-lite-v1:0 호출은 bedrock:InvokeModel 허용 정책이 없다는 이유로 403이 발생합니다. 해당 모델에 한정해 사용자 또는 승인된 실행 역할의 호출 권한을 확인해 주세요. 승인된 Lambda/EC2 실행 역할에서만 허용되는 경우 정확한 실행 역할과 경로를 알려 주세요. 스트리밍·모델 학습·Provisioned Throughput 권한은 필요하지 않습니다.

## 검토용 권한 범위

대상 추론 프로파일과 연결된 foundation-model ARN은 `GetInferenceProfile` 실제 응답으로 확인했습니다. 아래는 관리자가 검토할 허용 정책 초안이며 적용하지 않았습니다. 조직 정책, 권한 경계, 리전 제한의 명시적 Deny가 있다면 Allow 추가만으로 해결되지 않을 수 있습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeNovaLiteForPhotoObservation",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": [
        "arn:aws:bedrock:us-east-1:730335373015:inference-profile/us.amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-east-2::foundation-model/amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-west-2::foundation-model/amazon.nova-lite-v1:0"
      ]
    }
  ]
}
```

## 재검증

권한 반영 후 작업 폴더에서 `npm run smoke:bedrock`을 실행합니다. 세션이 만료됐으면 먼저 `aws login --profile bedrock-hackathon --region us-east-1`을 실행합니다.

완료 조건은 HTTP 200, `record_observation` 도구 호출 1개, Zod 검증 성공, 유효한 관찰 결과 반환입니다. 빈 테스트 카탈로그의 `model_not_found`는 정상입니다.

실행 기록:

- [Nova Lite 추론 프로파일](../artifacts/bedrock-smoke-2026-09-20T02-05-27-839Z.json)
- [Claude Haiku 추론 프로파일](../artifacts/bedrock-smoke-2026-09-20T02-07-57-663Z.json)
- [Nova Lite 직접 호출](../artifacts/bedrock-smoke-2026-09-20T02-08-28-255Z.json)

관리자에게 메시지를 직접 전송하지 않았습니다.
