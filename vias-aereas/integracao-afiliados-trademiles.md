# Integracao TradeMiles x Vias Aereas

Este documento descreve como o site Vias Aereas deve validar o afiliado pelo `ref` da URL e enviar o identificador do afiliado no fluxo de captura de lead/cliente.

## Objetivo

- Receber o `ref` (slug do afiliado) vindo em links/QR Codes.
- Resolver esse `ref` no TradeMiles.
- Vincular o lead/cliente ao afiliado correto.

## Endpoint de resolucao do afiliado

- **Metodo:** `GET`
- **URL:** `https://tradmiles-final.vercel.app/api/afiliado/referral?ref=<ref>`
- **Exemplo real:** `https://tradmiles-final.vercel.app/api/afiliado/referral?ref=isadora-zelaquett`
- **Auth:** nao requer autenticacao
- **CORS:** habilitado no endpoint (`GET, OPTIONS`)

## Parametros

- `ref` (query string, obrigatorio): slug unico do afiliado.

## Resposta de sucesso (200)

```json
{
  "ok": true,
  "data": {
    "affiliate": {
      "id": "clx123...",
      "name": "Isadora Zelaquett",
      "ref": "isadora-zelaquett",
      "commissionBps": 500
    },
    "links": {
      "flightSales": "https://...",
      "pointsPurchase": "https://..."
    }
  }
}
```

## Respostas de erro

### 400 - ref nao informado

```json
{
  "ok": false,
  "error": "Informe o parametro ref."
}
```

### 404 - afiliado invalido, inativo ou nao aprovado

```json
{
  "ok": false,
  "error": "Afiliado nao encontrado ou ainda nao aprovado."
}
```

### 500 - erro interno

```json
{
  "ok": false,
  "error": "Erro ao resolver afiliado."
}
```

## Fluxo recomendado no Vias Aereas

1. Ler `ref` da URL atual (`window.location.search`).
2. Chamar o endpoint de resolucao com `ref`.
3. Se `ok=true`, guardar `data.affiliate.id` como `affiliateId`.
4. Exibir a indicacao (ex.: "Indicado por <name>"), se desejado.
5. No submit do formulario de lead/cliente, enviar `affiliateId` no payload.
6. Se 404, seguir fluxo normal sem afiliado (ou mensagem amigavel).

## Exemplo de implementacao (frontend)

```ts
const params = new URLSearchParams(window.location.search);
const ref = params.get("ref");

let affiliateId: string | null = null;

if (ref) {
  const response = await fetch(
    `https://tradmiles-final.vercel.app/api/afiliado/referral?ref=${encodeURIComponent(ref)}`
  );

  if (response.ok) {
    const body = await response.json();
    affiliateId = body?.data?.affiliate?.id ?? null;
  }
}

// No envio do lead/cliente:
await fetch("/api/leads", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nome,
    email,
    telefone,
    affiliateId
  })
});
```

## Exemplo de teste rapido (curl)

```bash
curl -i "https://tradmiles-final.vercel.app/api/afiliado/referral?ref=isadora-zelaquett"
```

```bash
curl -i "https://tradmiles-final.vercel.app/api/afiliado/referral?ref=nao-existe"
```

## Checklist de homologacao

- [ ] Abrir URL com `?ref=<slug-valido>` e validar retorno 200.
- [ ] Confirmar captura de `affiliateId` no frontend.
- [ ] Enviar cadastro com `affiliateId` no payload final.
- [ ] Validar comportamento para `ref` invalido (404).
- [ ] Garantir fallback sem quebrar o formulario sem `ref`.

## Contato tecnico

Em caso de duvida sobre contrato da API ou mudancas de payload, alinhar com o time do TradeMiles antes de publicar em producao.
