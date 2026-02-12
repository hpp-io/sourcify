# Script for HPP chain

## 개요

blockscout API를 활용해 HPP 체인의 컨트랙트 정보를 sourcify DB에 저장하는 기능. 
sourcify의 monitor 서비스는 메타데이터 수집을 위해 반드시 ipfs를 이용하게 되어있는데 현재 우리 체인은 ipfs에 메타데이터를 올리지 않는 경우가 많아서 monitor 서비스가 제대로 동작하지 않음.


## 환경변수 설정 

프로젝트 루트에 .env 만들어서: `HPP_RPC_API_KEY=여기에_키` 등록

## 실행방법

예시
```shell
node services/monitor/scripts/blockscout_sourcify_backfill.js \
  --chainId 181228 \
  --rpcUrlTemplate "https://sepolia.hpp.io/{API_KEY}" \
  --rpcApiKeyEnv HPP_RPC_API_KEY \
  --blockscoutApi "https://sepolia-explorer.hpp.io/api" \
  --sourcify "http://localhost:5555" \
  --from 0 \
  --to latest \
  --concurrency 3
```

## 기타 설정 사항

.backfill-state-181228.json 같은 파일을 생성해서 중간에 끊겨도 이어서 스캔합니다.
Blockscout에서 소스가 없는 주소는 failedContracts로 남깁니다.
RPC URL의 {API_KEY}는 환경변수(기본 HPP_RPC_API_KEY)로 치환됩니다.