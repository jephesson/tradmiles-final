# TradeMiles — extensão LATAM

Preenche formulários na LATAM com dados vindos do TradeMiles (funcionário **logado**).

## Instalação (time interno)

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione esta pasta `extension/`
4. Faça login em `https://www.trademiles.com.br` (ou localhost)
5. Na venda, passo **Extensão LATAM**: passageiros + cartão → **Preparar extensão**
6. Abra a LATAM — botão **Preencher TradeMiles** se precisar

## O que NÃO faz (de propósito)

- Não guarda CVV (você digita na hora)
- Só funciona com sessão ativa no TradeMiles
- Pode ser desligada por venda (toggle) — padrão: **ligada**

## Fluxo na venda

1. Wizard: **link de pesquisa** → Seguir
2. Passo **Extensão LATAM**: cole passageiros + confira cartão (padrão de taxa)
3. **Preparar extensão** → abra a LATAM

Cartões: Cadastro → Funcionários → **Dados de pagamento**.

## Desenvolvimento

- `manifest.json` — permissões LATAM + TradeMiles (inclui www)
- `content/passengers.js` — passageiros (nome/data/sexo/CPF)
- `content/payment.js` — cartão + cobrança
- `background.js` — API do TradeMiles

Quando a LATAM mudar o HTML, ajuste os seletores em `content/`.
Recarregue a extensão em `chrome://extensions` após alterar os arquivos.
