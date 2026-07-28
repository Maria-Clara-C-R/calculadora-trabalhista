# Calculadora Trabalhista — versão 2.0

## Como abrir

1. Extraia o arquivo ZIP.
2. Abra a pasta extraída.
3. Dê dois cliques em `index.html`.

Não é necessário abrir terminal ou instalar nada.

## Estrutura

- `index.html` — página principal (visual mantido da v1).
- `assets/css/style.css` — estilos (com novos componentes: avisos, memória de cálculo, validação).
- `assets/js/app.js` — motor de cálculos completo, reconstruído na v2.0.

## O que mudou na v2.0

**Rescisão** agora cobre:
- Demissão sem justa causa, pedido de demissão, acordo (art. 484-A), justa causa e
  contrato de experiência/prazo determinado.
- Aviso prévio trabalhado ou indenizado, com **projeção do aviso** (a indenização projeta
  a data de saída para fins de contagem de 13º, férias e FGTS).
- Saldo de salário, 13º proporcional, férias vencidas, férias proporcionais + 1/3 constitucional.
- FGTS estimado do período e multa rescisória (40% ou 20%, conforme o tipo de rescisão).
- Descontos estimados de INSS/IRRF (opcional) sobre as verbas tributáveis.
- Avisos explicativos e validação de datas (ex.: demissão anterior à admissão).

**Calculadoras separadas:**
- Horas Extras + DSR (Descanso Semanal Remunerado), com dias úteis/descanso ajustáveis.
- Férias, com tabela de faltas injustificadas (art. 130 da CLT) e abono pecuniário.
- 13º Salário, com contagem automática de avos, 1ª/2ª parcela e descontos.
- FGTS, com estimativa de depósitos e multa rescisória.
- Acordo Trabalhista, para simular desconto negociado e parcelamento.

**Memória de cálculo:** todo resultado tem uma seção "Como cada valor foi calculado",
mostrando a fórmula usada em cada linha.

## Observação importante

Todos os valores são **estimativas** baseadas em regras gerais da CLT e em tabelas de
referência de INSS/IRRF (sujeitas a atualização periódica). Convenções coletivas,
benefícios contratuais e entendimentos jurídicos específicos (como a discussão sobre o
13º proporcional na justa causa) podem alterar os valores reais.

Antes de usar profissionalmente, revise e valide os cálculos com um(a) contador(a) ou
advogado(a) trabalhista.

## Versão Premium (mantida da v1)

- Cabeçalho visual com tema de tecnologia, negócios e cálculos.
- Imagem de fundo integrada ao projeto.
- Menu de calculadoras integrado ao cabeçalho.
- Layout responsivo para desktop, tablet e celular.
- Abertura direta pelo `index.html`, sem necessidade de terminal.
