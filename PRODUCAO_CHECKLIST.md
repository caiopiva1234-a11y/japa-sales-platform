# Checklist de Validacao para Producao

## 1) Preparacao de ambiente

- [ ] Servidor com Docker e Docker Compose instalados
- [ ] Arquivo `.env` preenchido com tokens reais
- [ ] `JWT_SECRET` alterado para chave forte
- [ ] Backup de banco configurado (dump diario)

## 2) Infraestrutura

- [ ] `docker compose -f infra/docker-compose.app.yml up -d`
- [ ] Verificar `api` em `/health` e `/ready`
- [ ] Verificar `web` carregando normalmente
- [ ] Verificar `evolution-api` ativa na porta configurada

## 3) Banco de dados

- [ ] Rodar `prisma generate`
- [ ] Rodar `prisma migrate deploy`
- [ ] Confirmar usuario admin criado com sucesso
- [ ] Alterar senha admin padrao apos primeiro login

## 4) Teste funcional minimo (ponta a ponta)

- [ ] Login na plataforma
- [ ] Criar cliente
- [ ] Criar pedido com itens
- [ ] Recalcular recomendacoes e validar sugestoes
- [ ] Abrir conversa, enviar mensagem WhatsApp
- [ ] Receber mensagem de retorno via webhook
- [ ] Rodar analise IA e confirmar classificacao
- [ ] Marcar resultado manual de abordagem
- [ ] Executar automacao de retencao/captacao e validar fila

## 5) Seguranca e operacao

- [ ] Habilitar HTTPS no dominio
- [ ] Restringir portas nao usadas no firewall
- [ ] Definir rotacao de logs
- [ ] Definir rotina de monitoramento (status da API e uso de disco)

## 6) Go-live

- [ ] Validacao com equipe (3 usuarios)
- [ ] Confirmar templates aprovados e padroes de abordagem
- [ ] Iniciar operacao assistida por 7 dias
- [ ] Revisao semanal dos KPIs de retencao, captacao e conversao
