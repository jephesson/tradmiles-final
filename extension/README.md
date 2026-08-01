# TradeMiles — extensão LATAM (MVP)

Preenche formulários na LATAM com dados vindos do TradeMiles (funcionário **logado**).

## Instalação (time interno)

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione esta pasta `extension/`
4. Faça login em `https://www.trademiles.com.br` (ou localhost)
5. Na venda, marque **Usar extensão LATAM** e prepare os passageiros
6. Abra o link REDEMPTION (`/pagamentos/passageiros?orderId=LA…`) — a extensão preenche

## O que NÃO faz (de propósito)

- Não guarda CVV (você digita na hora)
- Só funciona com sessão ativa no TradeMiles
- Pode ser desligada por venda (toggle) — padrão: desligada

## Fluxo na venda

1. No wizard de biometria, após gerar o **link de pesquisa**
2. Marque **Usar extensão LATAM**
3. Cole o texto dos passageiros → **Preparar extensão**
4. Abra a LATAM — passageiros e (se houver) cartão/endereço

Cartões: Cadastro → Funcionários → **Dados de pagamento**.

## Desenvolvimento

- `manifest.json` — permissões só LATAM + TradeMiles
- `content/passengers.js`
  - layout A: `/pagamentos/passageiros` (data `dd-mm-aaaa`)
  - layout B: `/v2/passageiros` (data `dd/mm/aaaa`, sem botão entre pax)
  - criança/bebê: CPF nos dois campos de documento
- `content/payment.js` — `/v2/pagamentos/?…&flow=BOOKING-REDEMPTION`
  - abre “Adicionar cartão”, preenche cartão + dados de cobrança (endereço já aberto)
  - CVV manual
- `background.js` — API do TradeMiles

Recarregue a extensão em `chrome://extensions` após alterar os arquivos.
