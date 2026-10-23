# TradeMiles LATAM — Safari (pacote separado do Chrome)

O Safari **não** carrega a pasta do Chrome. Esta pasta é a versão Safari.
A extensão do Chrome continua em `extension/` e pode ficar instalada ao mesmo tempo.

## Instalar (macOS)

1. Instale o **Xcode** na App Store (grátis). Abra uma vez e aceite a licença.
2. Descompacte este ZIP (ou use a pasta `extension-safari` do projeto).
3. No Terminal, na pasta descompactada:

```bash
chmod +x convert.sh
./convert.sh
```

4. O Xcode abre o app **TradeMiles LATAM Safari**. Clique em **▶ Run**.
5. Safari → **Ajustes** → **Extensões** → ligue **TradeMiles LATAM Safari**.
6. Se pedir: menu **Desenvolver** → **Permitir extensões não assinadas**.
   (Safari → Ajustes → Avançado → mostrar menu Desenvolver.)
7. Quando o Safari pedir acesso a `trademiles.com.br` e `latamairlines.com`, **Permitir**.
8. Faça login em **www.trademiles.com.br no Safari** (a sessão do Chrome não vale aqui).
9. Na venda, **Preparar extensão** e abra a LATAM **no Safari**.

## Uso no dia a dia

Chrome e Safari são independentes:

- Chrome → pasta `extension/` (`chrome://extensions`)
- Safari → este app convertido no Xcode (só precisa rodar o app de novo se atualizar a extensão)

Depois da primeira conversão, para atualizar: copie os arquivos novos nesta pasta, rode `./convert.sh` de novo (ou dê Play no Xcode) e recarregue a extensão em Ajustes → Extensões.
