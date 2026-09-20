# 물병 외 생활용품 카탈로그 확장

2026-09-20. 제품·제조사 적용 계열 405→470개, 부품 111→134개, 판매 항목 111→134개, 적용·제외 근거 487→573개. 실제 등록 분야 13→15개, 브랜드 20→22개, 부품 종류 22→25개다. 완제품 SKU 수가 아니라 제조사 적용 계열·구성품 모델을 포함한 수량이다.

물병 197개는 그대로이며, 물병 외 제품·계열이 208→273개로 증가했다. 화면 디자인은 수정하지 않고 공용 분류·카탈로그·확인 항목을 확장했다.

| 분야 | 추가 제품/계열 | 추가 부품 | 연결 기준 |
|---|---:|---:|---|
| 청소·세탁도구 | 7 | 6 | Vileda UltraMax, 1-2 Spray, Turbo, H2PrO Flat, Spin and Clean, ActiveMax, SprayMax의 교체 패드 |
| 욕실·배수설비 | 2 | 3 | IKEA LILLVIKEN 싱글·더블 배수트랩, 마개·자석 커버·추가연결부 |
| 가구·수납 | 6 | 6 | PAX 프레임 폭 50/75/100 × 깊이 35/58cm, 해당 KOMPLEMENT 화이트 선반 |
| 학용품·사무용품 | 16 | 2 | UNI 다색 펜 3계열의 SXR-80-07, Brother 13모델의 TZe-231 |
| 공구·취미용품 | 13 | 1 | OLFA 공식 적용 본체의 9mm ABB-10B 날 |
| 반려동물 | 11 | 2 | Drinkwell 모델별 PAC00-13906 활성탄 필터와 PAC00-13711 폼 필터 |
| 육아 | 4 | 2 | Bugaboo Bee 5와 Fox/Fox 2/Fox 3의 앞바퀴 |
| 의류·재봉 | 3 | 1 | SINGER 4423/4452/4552의 Class 15 투명 보빈 |
| 여행·운동 | 3 | 0 | MT100 Blue/Ergonomic, MT500 Anti-shock의 기존 8580865 보호캡 적용 추가 |

## 근거와 오연결 방지

- [Vileda UltraMax](https://www.vileda.co.uk/products/ultramax-refill)는 1-2 SprayMax에 적용하지 않는다. H2PrO Flat 패드도 다른 계열과 구분한다. 명시적 제외 근거를 별도 저장했다.
- [PAX 75×35cm 선반](https://www.ikea.com/kr/ko/p/komplement-shelf-white-50277996/)처럼 프레임 폭·깊이가 지정된 경우 해당 규격에만 연결한다. PAX만 읽히면 6규격을 선택지로 유지한다. 완제품 번호를 임의 생성하지 않았다.
- [Brother Korea PT-D200 소모품](https://support.brother.com/g/b/colist.aspx?c=kr&cao=tape&lang=ko&pfs=1&prod=d200eas)과 [공식 TZe-231 적용 목록](https://www.brother.com.br/products/TZE231)을 사용했다. PT-H110과 PT-H110BK 같은 접미 코드를 보존한다.
- [SINGER 4452](https://www.singer.com/products/singer-heavy-duty-4452-sewing-machine)의 투명 Class 15와 기존 Featherweight 보빈을 구분한다. [OLFA ABB-10B](https://www.olfa.co.jp/en/blades/1635.html)의 9mm 적용 목록을 기존 18mm 날에 일반화하지 않는다.
- [PetSafe 폼 필터](https://www.petsafe.com/p/drinkwell-foam-replacement-filters-2-pack/PAC00-13711/)와 활성탄 필터는 서로 대체품이 아니다. Stainless Multi-Pet에는 이 자료에서 확인된 폼 필터만 연결했다.

## 구매 경로와 검증 범위

추가한 23개 상품 URL의 읽기 전용 HTTP 검사에서 22개 응답 성공, element14 Korea 1개 자동 접속 제한(403)이 확인됐다. 링크 응답은 재고·배송 검증이 아니며, 신규 판매 상태는 전부 `unknown`이다. 국내 14개·해외 9개 경로를 분리했다. 해외몰의 한국 배송은 미확인이다.

OLFA 국내 상품은 HTTP 200이지만 상세 내용을 충분히 검수하지 못해 `link_only`로 남겼다. 공식 제조사 적용 근거와 판매처 내용 검수 여부는 별개다. 실제 모델·장착 조건 확인과 판매처 최종 옵션 선택이 필요하다.

- [추가 항목·출처 기록](../artifacts/catalog-balance-expansion.json)
- [23개 구매 링크 검사](../artifacts/catalog-balance-link-review.json)
- 변경 전후 전체 자료와 해시는 `data/history`에 저장했다.
- 새 범위의 사진 인식률은 아직 실물 사진으로 측정하지 않았다. 검증은 분류·모델 비교·근거 연결·서버 동작과 빌드 대상으로 진행한다.

검증 완료: `npm run check`에서 카탈로그 검증, 테스트 78개, 타입 검사와 프로덕션 빌드가 통과했다.

로컬 서버 `http://localhost:3001`에서 470개 반영과 청소·배수설비·라벨 테이프·가구의 4개 선택→구매 경로 흐름도 확인했다. [실행 결과](../artifacts/catalog-balance-live-verification.json). 검사 임시 기록은 삭제했다.
