# Japa Atacado - Sales Intelligence Platform

Plataforma complementar ao OLIST ERP para apoiar vendas, retencao, captacao e atendimento via WhatsApp.

## Objetivos

- Integrar dados do ERP (clientes, pedidos e itens vendidos)
- Aumentar recompra com sugestoes inteligentes por cliente
- Melhorar atendimento e conversao via WhatsApp (Evolution API)
- Monitorar resultados por dashboards de operacao e performance
- Evoluir por modulos sem acoplamento forte

## Arquitetura

- `apps/api`: backend Node (Fastify + TypeScript + Prisma)
- `apps/web`: frontend Next.js com login e inbox comercial
- `infra/docker-compose.yml`: stack local com Postgres, Redis e Evolution API

## Modulos de negocio

- Auth e controle de acesso
- Integracao OLIST
- CRM de clientes e historico de compras
- Recomendacao de recompra e cross-sell
- Atendimento WhatsApp e automacoes
- Analise IA de conversas e qualidade de abordagem
- Dashboard executivo/comercial
- Captacao de novos clientes
- Esteiras automaticas de retencao e captacao (30/60/90 dias)
- Medicao de performance por template de abordagem

## Execucao (ambiente com Node instalado)

1. Instale Node 20+ e npm
2. Configure variaveis com base em `.env.example`
3. Suba infraestrutura:
   - `docker compose -f infra/docker-compose.yml up -d`
4. Instale dependencias na raiz:
   - `npm install`
5. Rode migracao Prisma:
   - `npm run prisma:migrate --workspace @japa/api`
6. Inicie API e Web:
   - `npm run dev --workspace @japa/api`
   - `npm run dev --workspace @japa/web`

## Deploy

O projeto esta preparado para deploy em VPS (Hostinger) com Docker Compose.
Tambem inclui CI/CD por GitHub Actions em `.github/workflows/deploy.yml`.

### CI/CD automatico (GitHub -> VPS)

1. No GitHub do repositorio, abra `Settings -> Secrets and variables -> Actions`.
2. Crie os secrets:
   - `VPS_HOST` (ex.: `72.60.195.240`)
   - `VPS_USER` (ex.: `root`)
   - `VPS_SSH_KEY` (conteudo da chave privada usada para acessar a VPS)
   - `VPS_APP_DIR` (ex.: `/opt/japa/japa-sales-platform`)
3. Garanta que a chave publica correspondente esteja autorizada na VPS em `~/.ssh/authorized_keys`.
4. A cada push na branch `main`, o workflow vai:
   - atualizar codigo com `git pull`
   - rebuildar containers com Docker Compose
   - aplicar schema Prisma (`db push`)
