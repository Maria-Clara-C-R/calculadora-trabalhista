/* ======================================================================
   CALCULADORA TRABALHISTA — MOTOR DE CÁLCULOS v2.0
   Sem dependências externas, sem módulos — funciona abrindo o index.html
   diretamente no navegador.

   IMPORTANTE: todos os valores produzidos aqui são ESTIMATIVAS baseadas
   em regras gerais da CLT. Alíquotas de INSS/IRRF, entendimentos sobre
   verbas em justa causa e regras de FGTS podem mudar e têm particulari-
   dades por caso. Sempre confira com contador(a)/advogado(a) trabalhista.
   ====================================================================== */

(function () {
  'use strict';

  /* ====================================================================
     1. UTILITÁRIOS GERAIS (datas, dinheiro, DOM)
     ==================================================================== */

  function fmt(v) {
    if (!isFinite(v)) v = 0;
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtPct(v) {
    return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  }

  function fmtDate(d) {
    if (!d || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  }

  // Lê um <input type="date"> como Date "seguro" (meio-dia, evita bug de fuso horário)
  function readDate(id) {
    var el = document.getElementById(id);
    if (!el || !el.value) return null;
    var d = new Date(el.value + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function readNumber(id) {
    var el = document.getElementById(id);
    if (!el || el.value === '') return NaN;
    return parseFloat(el.value);
  }

  function readInt(id) {
    var el = document.getElementById(id);
    if (!el || el.value === '') return NaN;
    return parseInt(el.value, 10);
  }

  function readSelect(id) {
    var el = document.getElementById(id);
    return el ? el.value : null;
  }

  function el(id) { return document.getElementById(id); }

  function diffDays(d1, d2) {
    return Math.round((d2.getTime() - d1.getTime()) / 86400000);
  }

  function addDays(d, n) {
    var r = new Date(d.getTime());
    r.setDate(r.getDate() + n);
    return r;
  }

  function addMonths(d, n) {
    var r = new Date(d.getTime());
    r.setMonth(r.getMonth() + n);
    return r;
  }

  // Meses completos (calendário) entre duas datas, sem considerar a regra dos 15 dias
  function mesesCompletos(d1, d2) {
    if (d2 <= d1) return 0;
    var meses = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    if (d2.getDate() < d1.getDate()) meses -= 1;
    return Math.max(0, meses);
  }

  // Regra CLT: no período final (fração), conta como mês cheio se trabalhados >= 15 dias
  // (Súmula 171 do TST, aplicada a férias e 13º proporcionais)
  function mesesProporcionais(d1, d2, opts) {
    opts = opts || {};
    if (!d1 || !d2 || d2 <= d1) return 0;
    var meses = mesesCompletos(d1, d2);
    var aniversario = addMonths(d1, meses);
    var diasResto = diffDays(aniversario, d2);
    if (diasResto >= 15) meses += 1;
    if (opts.capAno) meses = Math.min(meses, 12);
    return meses;
  }

  // Última "data-base" (aniversário do contrato) antes ou igual à data de referência
  function ultimaDataBase(dataAdmissao, dataRef) {
    var anos = dataRef.getFullYear() - dataAdmissao.getFullYear();
    var candidato = addMonths(dataAdmissao, anos * 12);
    if (candidato > dataRef) candidato = addMonths(dataAdmissao, (anos - 1) * 12);
    return candidato;
  }

  // Dias de aviso prévio proporcional (Lei 12.506/2011): 30 dias + 3 dias por ano completo, até 90
  function diasAvisoPrevio(dataAdmissao, dataRef) {
    var meses = mesesCompletos(dataAdmissao, dataRef);
    var anosCompletos = Math.floor(meses / 12);
    return Math.min(30 + anosCompletos * 3, 90);
  }

  function hoje() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }

  /* ====================================================================
     2. TABELAS DE REFERÊNCIA — INSS e IRRF (estimativas, sujeitas a
        atualização anual pelo Governo Federal). Usadas só nos módulos
        que calculam descontos (rescisão e 13º, na 2ª parcela).
     ==================================================================== */

  // Tabela progressiva de INSS (referência 2024/2025) — faixas mensais
  var TABELA_INSS = [
    { ate: 1412.00, aliquota: 0.075 },
    { ate: 2666.68, aliquota: 0.09 },
    { ate: 4000.03, aliquota: 0.12 },
    { ate: 7786.02, aliquota: 0.14 }
  ];
  var TETO_INSS = 7786.02;

  function calcularINSS(base) {
    if (!base || base <= 0) return 0;
    var baseCalc = Math.min(base, TETO_INSS);
    var contribuicao = 0;
    var faixaAnterior = 0;
    for (var i = 0; i < TABELA_INSS.length; i++) {
      var faixa = TABELA_INSS[i];
      var tetoFaixa = Math.min(faixa.ate, baseCalc);
      if (tetoFaixa > faixaAnterior) {
        contribuicao += (tetoFaixa - faixaAnterior) * faixa.aliquota;
      }
      faixaAnterior = faixa.ate;
      if (baseCalc <= faixa.ate) break;
    }
    return contribuicao;
  }

  // Tabela progressiva de IRRF (referência 2024/2025) — mensal, sem dependentes
  var TABELA_IRRF = [
    { ate: 2259.20, aliquota: 0, deducao: 0 },
    { ate: 2826.65, aliquota: 0.075, deducao: 169.44 },
    { ate: 3751.05, aliquota: 0.15, deducao: 381.44 },
    { ate: 4664.68, aliquota: 0.225, deducao: 662.77 },
    { ate: Infinity, aliquota: 0.275, deducao: 896.00 }
  ];

  function calcularIRRF(baseAposINSS) {
    if (!baseAposINSS || baseAposINSS <= 0) return 0;
    for (var i = 0; i < TABELA_IRRF.length; i++) {
      if (baseAposINSS <= TABELA_IRRF[i].ate) {
        var imposto = baseAposINSS * TABELA_IRRF[i].aliquota - TABELA_IRRF[i].deducao;
        return Math.max(0, imposto);
      }
    }
    return 0;
  }

  /* ====================================================================
     3. RENDERIZAÇÃO DE RESULTADOS (com memória de cálculo)
     ==================================================================== */

  // item: { label, valor, formula, isento, informativo }
  // "informativo: true" identifica linhas que apenas detalham/decompõem outro valor já somado
  // (ex.: valor de uma parcela) — elas aparecem na lista, mas NÃO entram na soma do total.
  function linhaResultado(item, tipo) {
    var cls = tipo === 'desconto' ? 'linha-desconto' : 'linha-credito';
    if (item.informativo) cls += ' linha-informativa';
    var sinal = tipo === 'desconto' ? '− ' : '';
    var badgeIsento = item.isento ? '<span class="badge-isento" title="Não incide INSS/IRRF">isento</span>' : '';
    var badgeInfo = item.informativo ? '<span class="badge-info" title="Não somado ao total, é o detalhamento de outra linha">detalhe</span>' : '';
    return '<div class="result-row ' + cls + '">' +
      '<span class="result-label">' + item.label + badgeIsento + badgeInfo + '</span>' +
      '<span class="result-value">' + sinal + fmt(item.valor) + '</span>' +
      '</div>';
  }

  function memoriaItem(item) {
    return '<div class="memoria-item"><strong>' + item.label + ':</strong> ' +
      '<span class="memoria-formula">' + item.formula + '</span> = ' +
      '<span class="memoria-resultado">' + fmt(item.valor) + '</span></div>';
  }

  function avisosHtml(avisos) {
    if (!avisos || !avisos.length) return '';
    var lis = avisos.map(function (a) { return '<li>' + a + '</li>'; }).join('');
    return '<div class="alert-box"><div class="alert-title">⚠ Avisos importantes</div><ul>' + lis + '</ul></div>';
  }

  // Renderiza um resultado completo: créditos, descontos, total líquido, avisos e memória de cálculo
  function renderResultado(containerId, config) {
    var container = el(containerId);
    var creditos = config.creditos || [];
    var descontos = config.descontos || [];
    var avisos = config.avisos || [];
    var totalCreditos = creditos.reduce(function (s, i) { return s + (i.informativo ? 0 : (i.valor || 0)); }, 0);
    var totalDescontos = descontos.reduce(function (s, i) { return s + (i.informativo ? 0 : (i.valor || 0)); }, 0);
    var liquido = totalCreditos - totalDescontos;

    var html = avisosHtml(avisos);

    html += '<div class="result-section">';
    html += creditos.map(function (i) { return linhaResultado(i, 'credito'); }).join('');
    html += '</div>';

    if (descontos.length) {
      html += '<div class="result-section result-section-descontos">';
      html += '<div class="result-subtitle">Descontos</div>';
      html += descontos.map(function (i) { return linhaResultado(i, 'desconto'); }).join('');
      html += '</div>';
    }

    html += '<div class="result-total">' +
      '<span>' + (descontos.length ? 'TOTAL LÍQUIDO ESTIMADO' : 'TOTAL ESTIMADO') + '</span>' +
      '<span class="result-total-value">' + fmt(liquido) + '</span>' +
      '</div>';

    var todosItens = creditos.concat(descontos);
    html += '<details class="memoria-calculo"><summary>📐 Como cada valor foi calculado</summary>' +
      '<div class="memoria-lista">' + todosItens.map(memoriaItem).join('') + '</div>' +
      '<p class="memoria-disclaimer">Cálculos baseados em regras gerais da CLT e em tabelas de referência de INSS/IRRF. ' +
      'Convenções coletivas, benefícios contratuais e alíquotas vigentes podem alterar os valores reais. ' +
      'Consulte um(a) contador(a) ou advogado(a) trabalhista antes de tomar decisões.</p>' +
      '</details>';

    container.innerHTML = html;
    container.classList.add('show');
  }

  /* ====================================================================
     4. VALIDAÇÃO DE CAMPOS
     ==================================================================== */

  function limparErros(formEl) {
    formEl.querySelectorAll('.field-error').forEach(function (e) { e.remove(); });
    formEl.querySelectorAll('.field-invalid').forEach(function (e) { e.classList.remove('field-invalid'); });
  }

  function marcarErro(inputEl, mensagem) {
    if (!inputEl) return;
    inputEl.classList.add('field-invalid');
    var msg = document.createElement('div');
    msg.className = 'field-error';
    msg.textContent = mensagem;
    inputEl.insertAdjacentElement('afterend', msg);
  }

  /* ====================================================================
     5. NAVEGAÇÃO POR ABAS
     ==================================================================== */

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) {
          b.classList.remove('tab-active');
          b.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('tab-active');
        btn.setAttribute('aria-selected', 'true');
        el('panel-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  /* ====================================================================
     6. RESCISÃO — motor completo
     ==================================================================== */

  function setupRescisaoUI() {
    var tipoSel = el('res-tipo');
    var avisoWrap = el('res-aviso-modalidade-wrap');
    var avisoCumpridoWrap = el('res-aviso-cumprido-wrap');
    var fimContratoWrap = el('res-fim-contrato-wrap');

    function atualizar() {
      var tipo = tipoSel.value;
      avisoWrap.style.display = (tipo === 'sem_justa' || tipo === 'acordo') ? '' : 'none';
      avisoCumpridoWrap.style.display = (tipo === 'pedido') ? '' : 'none';
      fimContratoWrap.style.display = (tipo === 'experiencia') ? '' : 'none';
    }
    tipoSel.addEventListener('change', atualizar);
    atualizar();

    // Sugestão automática de "dias trabalhados no mês" a partir da data de demissão
    el('res-demissao').addEventListener('change', function () {
      var dem = readDate('res-demissao');
      var diasInput = el('res-saldo-dias');
      if (dem && !diasInput.dataset.tocado) {
        diasInput.value = dem.getDate();
      }
    });
    el('res-saldo-dias').addEventListener('input', function () {
      this.dataset.tocado = '1';
    });
  }

  function validarRescisao(input) {
    var erros = [];
    if (!input.admissao) erros.push({ id: 'res-admissao', msg: 'Informe a data de admissão.' });
    if (!input.demissao) erros.push({ id: 'res-demissao', msg: 'Informe a data de demissão.' });
    if (input.admissao && input.demissao && input.demissao < input.admissao) {
      erros.push({ id: 'res-demissao', msg: 'A demissão não pode ser anterior à admissão.' });
    }
    if (input.admissao && input.admissao > hoje()) {
      erros.push({ id: 'res-admissao', msg: 'A data de admissão não pode ser no futuro.' });
    }
    if (isNaN(input.salario) || input.salario <= 0) {
      erros.push({ id: 'res-salario', msg: 'Informe um salário bruto válido.' });
    }
    if (isNaN(input.diasTrabalhadosMes) || input.diasTrabalhadosMes < 0 || input.diasTrabalhadosMes > 31) {
      erros.push({ id: 'res-saldo-dias', msg: 'Informe um número de dias entre 0 e 31.' });
    }
    if (input.tipo === 'experiencia') {
      if (!input.fimContrato) {
        erros.push({ id: 'res-fim-contrato', msg: 'Informe a data prevista de término do contrato.' });
      } else if (input.demissao && input.fimContrato <= input.demissao) {
        erros.push({ id: 'res-fim-contrato', msg: 'O término previsto deve ser depois da data de demissão (rescisão antecipada).' });
      }
    }
    return erros;
  }

  function calcularRescisao(input) {
    var creditos = [];
    var descontos = [];
    var avisos = [];

    var salario = input.salario;
    var tipo = input.tipo;
    var admissao = input.admissao;
    var demissao = input.demissao;

    // ---- Aviso prévio (dias legais e projeção) ----
    var diasAviso = diasAvisoPrevio(admissao, demissao);
    var temAvisoIndenizadoPago = false;
    var valorAvisoPago = 0;
    var percentualAviso = 1; // 100% padrão; acordo = 50%
    var dataEfetiva = demissao; // data usada para contar tempo de serviço (13º, férias, FGTS)

    if (tipo === 'sem_justa' || tipo === 'acordo') {
      percentualAviso = tipo === 'acordo' ? 0.5 : 1;
      if (input.avisoModalidade === 'indenizado') {
        temAvisoIndenizadoPago = true;
        valorAvisoPago = (salario / 30) * diasAviso * percentualAviso;
        // O aviso indenizado PROJETA o contrato: conta como tempo de serviço para 13º, férias e FGTS
        dataEfetiva = addDays(demissao, diasAviso);
        creditos.push({
          label: 'Aviso Prévio Indenizado (' + diasAviso + ' dias' + (tipo === 'acordo' ? ', 50% no acordo' : '') + ')',
          valor: valorAvisoPago,
          formula: '(' + fmt(salario) + ' ÷ 30) × ' + diasAviso + ' dias' + (tipo === 'acordo' ? ' × 50%' : ''),
          isento: true
        });
        avisos.push('Aviso prévio indenizado projeta o contrato até <strong>' + fmtDate(dataEfetiva) +
          '</strong> para fins de contagem de 13º, férias e FGTS (art. 487, §1º da CLT).');
      } else {
        avisos.push('Aviso prévio trabalhado: os ' + diasAviso + ' dias já são pagos no salário normal do período trabalhado, ' +
          'por isso não geram uma verba adicional nesta simulação.');
      }
    } else if (tipo === 'pedido') {
      if (input.avisoCumprido === 'nao') {
        var descontoAviso = (salario / 30) * 30; // empregado deve indenizar 30 dias ao empregador
        descontos.push({
          label: 'Desconto por Aviso Prévio não cumprido (30 dias)',
          valor: descontoAviso,
          formula: '(' + fmt(salario) + ' ÷ 30) × 30 dias'
        });
        avisos.push('No pedido de demissão sem cumprimento do aviso prévio, a empresa pode descontar até 30 dias de salário do empregado (art. 487, §2º da CLT).');
      }
    } else if (tipo === 'justa_causa') {
      avisos.push('Na dispensa por justa causa não há aviso prévio, multa do FGTS nem férias/13º proporcionais — entendimento majoritário, mas sujeito a discussão em cada caso.');
    } else if (tipo === 'experiencia') {
      avisos.push('Contrato de experiência/prazo determinado não tem aviso prévio: aplica-se a indenização do art. 479 da CLT pelo tempo que faltava.');
    }

    // ---- Saldo de salário ----
    var saldoSalario = (salario / 30) * input.diasTrabalhadosMes;
    creditos.push({
      label: 'Saldo de Salário (' + input.diasTrabalhadosMes + ' dias)',
      valor: saldoSalario,
      formula: '(' + fmt(salario) + ' ÷ 30) × ' + input.diasTrabalhadosMes + ' dias',
      isento: false
    });

    // ---- 13º proporcional ----
    var decimoProporcional = 0;
    var mesesDecimo = 0;
    if (tipo !== 'justa_causa') {
      var inicioAno = new Date(dataEfetiva.getFullYear(), 0, 1, 12, 0, 0);
      var baseInicioDecimo = admissao > inicioAno ? admissao : inicioAno;
      mesesDecimo = mesesProporcionais(baseInicioDecimo, dataEfetiva, { capAno: true });
      decimoProporcional = (salario / 12) * mesesDecimo;
      creditos.push({
        label: '13º Salário Proporcional (' + mesesDecimo + '/12 avos)',
        valor: decimoProporcional,
        formula: '(' + fmt(salario) + ' ÷ 12) × ' + mesesDecimo + ' avos',
        isento: false
      });
    } else {
      avisos.push('13º proporcional não incluído: entendimento aplicado aqui é o de perda em caso de justa causa (há divergência doutrinária sobre este ponto).');
    }

    // ---- Férias vencidas ----
    if (input.feriasVencidas) {
      var valorFeriasVencidas = salario;
      var tercoFeriasVencidas = salario / 3;
      creditos.push({
        label: 'Férias Vencidas',
        valor: valorFeriasVencidas,
        formula: '1 salário integral (período aquisitivo já completo e não gozado)',
        isento: true
      });
      creditos.push({
        label: '1/3 Constitucional (férias vencidas)',
        valor: tercoFeriasVencidas,
        formula: fmt(valorFeriasVencidas) + ' ÷ 3',
        isento: true
      });
    }

    // ---- Férias proporcionais ----
    var feriasProporcionais = 0, tercoProporcional = 0, mesesFerias = 0;
    if (tipo !== 'justa_causa') {
      var dataBaseFerias = ultimaDataBase(admissao, dataEfetiva);
      mesesFerias = mesesProporcionais(dataBaseFerias, dataEfetiva, { capAno: true });
      feriasProporcionais = (salario / 12) * mesesFerias;
      tercoProporcional = feriasProporcionais / 3;
      creditos.push({
        label: 'Férias Proporcionais (' + mesesFerias + '/12 avos)',
        valor: feriasProporcionais,
        formula: '(' + fmt(salario) + ' ÷ 12) × ' + mesesFerias + ' avos (a partir de ' + fmtDate(dataBaseFerias) + ')',
        isento: true
      });
      creditos.push({
        label: '1/3 Constitucional (férias proporcionais)',
        valor: tercoProporcional,
        formula: fmt(feriasProporcionais) + ' ÷ 3',
        isento: true
      });
    } else {
      avisos.push('Férias proporcionais não incluídas na justa causa (art. 146, parágrafo único da CLT).');
    }

    // ---- Indenização do contrato de experiência/prazo determinado (art. 479 CLT) ----
    if (tipo === 'experiencia' && input.fimContrato) {
      var diasRestantes = diffDays(demissao, input.fimContrato);
      var salariosRestantes = diasRestantes / 30;
      var indenizacao479 = salariosRestantes * salario * 0.5;
      creditos.push({
        label: 'Indenização Art. 479 (metade do período restante)',
        valor: indenizacao479,
        formula: '(' + diasRestantes + ' dias restantes ÷ 30) × ' + fmt(salario) + ' × 50%',
        isento: true
      });
      avisos.push('A indenização do art. 479 é devida quando a empresa rompe o contrato por prazo determinado antes do fim previsto, sem justa causa.');
    }

    // ---- FGTS depositado (estimativa) + Multa rescisória ----
    var mesesFgts = mesesProporcionais(admissao, dataEfetiva) || mesesCompletos(admissao, dataEfetiva);
    if (mesesFgts <= 0) mesesFgts = Math.max(1, Math.round(diffDays(admissao, dataEfetiva) / 30));
    var fgtsDepositado = salario * 0.08 * mesesFgts;
    creditos.push({
      label: 'FGTS Depositado (estimado, referencial)',
      valor: fgtsDepositado,
      formula: fmt(salario) + ' × 8% × ' + mesesFgts + ' meses estimados',
      isento: true
    });
    avisos.push('O valor do FGTS é uma estimativa (8% do salário por mês de contrato). O saldo real depende do extrato oficial da Caixa, pois considera 13º, férias e eventuais variações salariais.');

    var percentualMulta = 0;
    if (tipo === 'sem_justa') percentualMulta = 0.4;
    else if (tipo === 'acordo') percentualMulta = 0.2;
    else if (tipo === 'experiencia') {
      percentualMulta = 0.4;
      avisos.push('Foi considerada também a multa de 40% do FGTS na rescisão antecipada do contrato por prazo determinado pelo empregador — ponto que pode variar conforme entendimento do caso.');
    }

    if (percentualMulta > 0) {
      var multa = fgtsDepositado * percentualMulta;
      creditos.push({
        label: 'Multa Rescisória FGTS (' + (percentualMulta * 100) + '%)',
        valor: multa,
        formula: fmt(fgtsDepositado) + ' × ' + (percentualMulta * 100) + '%',
        isento: true
      });
    } else if (tipo === 'pedido' || tipo === 'justa_causa') {
      avisos.push('Não há multa de 40% do FGTS neste tipo de desligamento, e o saldo do FGTS permanece na conta (sem direito a saque imediato, salvo exceções legais).');
    }

    // ---- Descontos de INSS/IRRF sobre parcelas tributáveis (saldo de salário + 13º) ----
    if (input.calcularDescontos) {
      var inssSaldo = calcularINSS(saldoSalario);
      if (inssSaldo > 0) {
        descontos.push({
          label: 'INSS sobre Saldo de Salário',
          valor: inssSaldo,
          formula: 'Tabela progressiva INSS sobre ' + fmt(saldoSalario)
        });
      }
      var irrfSaldo = calcularIRRF(saldoSalario - inssSaldo);
      if (irrfSaldo > 0) {
        descontos.push({
          label: 'IRRF sobre Saldo de Salário',
          valor: irrfSaldo,
          formula: 'Tabela progressiva IRRF sobre ' + fmt(saldoSalario - inssSaldo) + ' (após INSS)'
        });
      }
      if (decimoProporcional > 0) {
        var inssDecimo = calcularINSS(decimoProporcional);
        if (inssDecimo > 0) {
          descontos.push({
            label: 'INSS sobre 13º Proporcional',
            valor: inssDecimo,
            formula: 'Tabela progressiva INSS sobre ' + fmt(decimoProporcional) + ' (cálculo isolado do 13º)'
          });
        }
        var irrfDecimo = calcularIRRF(decimoProporcional - inssDecimo);
        if (irrfDecimo > 0) {
          descontos.push({
            label: 'IRRF sobre 13º Proporcional',
            valor: irrfDecimo,
            formula: 'Tabela progressiva IRRF sobre ' + fmt(decimoProporcional - inssDecimo) + ' (após INSS)'
          });
        }
      }
      avisos.push('Férias, aviso prévio indenizado e multa do FGTS são isentos de INSS e IRRF. O desconto foi aplicado apenas sobre saldo de salário e 13º proporcional, que são tributáveis.');
    }

    return { creditos: creditos, descontos: descontos, avisos: avisos };
  }

  function setupRescisaoForm() {
    setupRescisaoUI();
    el('form-rescisao').addEventListener('submit', function (e) {
      e.preventDefault();
      var formEl = e.target;
      limparErros(formEl);

      var input = {
        salario: readNumber('res-salario'),
        tipo: readSelect('res-tipo'),
        admissao: readDate('res-admissao'),
        demissao: readDate('res-demissao'),
        fimContrato: readDate('res-fim-contrato'),
        diasTrabalhadosMes: readInt('res-saldo-dias'),
        feriasVencidas: readSelect('res-ferias-vencidas') === '1',
        avisoModalidade: readSelect('res-aviso-modalidade'),
        avisoCumprido: readSelect('res-aviso-cumprido'),
        calcularDescontos: el('res-calcular-descontos').checked
      };

      var erros = validarRescisao(input);
      if (erros.length) {
        erros.forEach(function (er) { marcarErro(el(er.id), er.msg); });
        el(erros[0].id).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      var resultado = calcularRescisao(input);
      renderResultado('result-rescisao', resultado);
    });
  }

  /* ====================================================================
     7. HORAS EXTRAS + DSR
     ==================================================================== */

  function setupExtrasForm() {
    el('form-extras').addEventListener('submit', function (e) {
      e.preventDefault();
      var formEl = e.target;
      limparErros(formEl);

      var salario = readNumber('ext-salario');
      var hMes = readNumber('ext-horas-mes');
      var qtd = readNumber('ext-qtd');
      var perc = readNumber('ext-perc') / 100;
      var diasUteis = readNumber('ext-dias-uteis');
      var diasDescanso = readNumber('ext-dias-descanso');

      var erros = [];
      if (isNaN(salario) || salario <= 0) erros.push({ id: 'ext-salario', msg: 'Informe um salário válido.' });
      if (isNaN(hMes) || hMes <= 0) erros.push({ id: 'ext-horas-mes', msg: 'Informe a jornada mensal em horas.' });
      if (isNaN(qtd) || qtd < 0) erros.push({ id: 'ext-qtd', msg: 'Informe a quantidade de horas extras.' });
      if (isNaN(diasUteis) || diasUteis <= 0) erros.push({ id: 'ext-dias-uteis', msg: 'Informe os dias úteis no mês.' });
      if (isNaN(diasDescanso) || diasDescanso < 0) erros.push({ id: 'ext-dias-descanso', msg: 'Informe os domingos/feriados no mês.' });
      if (erros.length) {
        erros.forEach(function (er) { marcarErro(el(er.id), er.msg); });
        return;
      }

      var valorHora = salario / hMes;
      var valorHoraExtra = valorHora * (1 + perc);
      var totalExtras = valorHoraExtra * qtd;
      var dsr = (totalExtras / diasUteis) * diasDescanso;

      renderResultado('result-extras', {
        creditos: [
          { label: 'Valor da Hora Normal', valor: valorHora, formula: fmt(salario) + ' ÷ ' + hMes + ' horas' },
          { label: 'Valor da Hora Extra (+' + (perc * 100) + '%)', valor: valorHoraExtra, formula: fmt(valorHora) + ' × (1 + ' + (perc * 100) + '%)' },
          { label: 'Total de ' + qtd + ' Horas Extras', valor: totalExtras, formula: fmt(valorHoraExtra) + ' × ' + qtd + ' horas' },
          { label: 'DSR sobre Horas Extras', valor: dsr, formula: '(' + fmt(totalExtras) + ' ÷ ' + diasUteis + ' dias úteis) × ' + diasDescanso + ' dias de descanso' }
        ],
        avisos: ['O DSR (Descanso Semanal Remunerado) sobre horas extras é devido a empregados horistas/comissionados; para mensalistas, o valor das horas extras já costuma refletir a remuneração dos dias de descanso — confira sua convenção coletiva.']
      });
    });
  }

  /* ====================================================================
     8. FÉRIAS
     ==================================================================== */

  function diasFeriasPorFaltas(faltas) {
    if (faltas <= 5) return 30;
    if (faltas <= 14) return 24;
    if (faltas <= 23) return 18;
    if (faltas <= 32) return 12;
    return 0;
  }

  function setupFeriasForm() {
    el('fer-faltas').addEventListener('change', function () {
      var faltas = readInt('fer-faltas');
      if (!isNaN(faltas)) {
        el('fer-dias').value = diasFeriasPorFaltas(faltas);
      }
    });

    el('form-ferias').addEventListener('submit', function (e) {
      e.preventDefault();
      var formEl = e.target;
      limparErros(formEl);

      var salario = readNumber('fer-salario');
      var dias = readInt('fer-dias');
      var abono = readSelect('fer-abono') === '1';

      var erros = [];
      if (isNaN(salario) || salario <= 0) erros.push({ id: 'fer-salario', msg: 'Informe um salário válido.' });
      if (isNaN(dias) || dias < 0 || dias > 30) erros.push({ id: 'fer-dias', msg: 'Dias de férias deve estar entre 0 e 30.' });
      if (abono && dias < 20) erros.push({ id: 'fer-dias', msg: 'Para vender 10 dias (abono) é preciso ter direito a pelo menos 20 dias de férias.' });
      if (erros.length) {
        erros.forEach(function (er) { marcarErro(el(er.id), er.msg); });
        return;
      }

      var valFerias = (salario / 30) * dias;
      var terco = valFerias / 3;
      var creditos = [
        { label: 'Férias (' + dias + ' dias)', valor: valFerias, formula: '(' + fmt(salario) + ' ÷ 30) × ' + dias + ' dias', isento: false },
        { label: '1/3 Constitucional', valor: terco, formula: fmt(valFerias) + ' ÷ 3', isento: false }
      ];

      var avisos = ['Faltas injustificadas no período aquisitivo reduzem os dias de férias, conforme art. 130 da CLT.'];

      if (abono) {
        var valorDiaAbono = salario / 30;
        var abonoBase = valorDiaAbono * 10;
        var abonoTerco = abonoBase / 3;
        creditos.push({ label: 'Abono Pecuniário (venda de 10 dias)', valor: abonoBase, formula: '(' + fmt(salario) + ' ÷ 30) × 10 dias', isento: true });
        creditos.push({ label: '1/3 sobre Abono Pecuniário', valor: abonoTerco, formula: fmt(abonoBase) + ' ÷ 3', isento: true });
        avisos.push('O abono pecuniário (venda de 10 dias de férias) é isento de INSS e IRRF e deve ser solicitado até 15 dias antes do fim do período aquisitivo.');
      }

      renderResultado('result-ferias', { creditos: creditos, avisos: avisos });
    });
  }

  /* ====================================================================
     9. 13º SALÁRIO
     ==================================================================== */

  function setupDecimoForm() {
    el('form-decimo').addEventListener('submit', function (e) {
      e.preventDefault();
      var formEl = e.target;
      limparErros(formEl);

      var salario = readNumber('dec-salario');
      var admissao = readDate('dec-admissao');
      var referencia = readDate('dec-referencia');
      var parcela = readSelect('dec-parcela');
      var descontar = el('dec-calcular-descontos').checked;

      var erros = [];
      if (isNaN(salario) || salario <= 0) erros.push({ id: 'dec-salario', msg: 'Informe um salário válido.' });
      if (!admissao) erros.push({ id: 'dec-admissao', msg: 'Informe a data de admissão.' });
      if (!referencia) erros.push({ id: 'dec-referencia', msg: 'Informe a data de referência.' });
      if (admissao && referencia && referencia < admissao) erros.push({ id: 'dec-referencia', msg: 'A data de referência não pode ser anterior à admissão.' });
      if (erros.length) {
        erros.forEach(function (er) { marcarErro(el(er.id), er.msg); });
        return;
      }

      var inicioAno = new Date(referencia.getFullYear(), 0, 1, 12, 0, 0);
      var baseInicio = admissao > inicioAno ? admissao : inicioAno;
      var meses = mesesProporcionais(baseInicio, referencia, { capAno: true });
      if (referencia.getMonth() === 11 && referencia.getDate() >= 31) meses = Math.min(12, meses);

      var integral = (salario / 12) * meses;
      var creditos = [];
      var avisos = ['O 13º salário é pago em até duas parcelas: a 1ª (até 50%) sem descontos, até 30/11, e a 2ª com desconto de INSS/IRRF, até 20/12.'];

      if (parcela === 'primeira') {
        var primeira = integral / 2;
        creditos.push({ label: '1ª Parcela do 13º (' + meses + '/12 avos)', valor: primeira, formula: '[(' + fmt(salario) + ' ÷ 12) × ' + meses + ' avos] ÷ 2', isento: true });
        renderResultado('result-decimo', { creditos: creditos, avisos: avisos });
        return;
      }

      var descontos = [];
      if (parcela === 'segunda') {
        var primeiraPaga = integral / 2;
        var segunda = integral - primeiraPaga;
        creditos.push({ label: '2ª Parcela do 13º (bruta)', valor: segunda, formula: '(' + fmt(salario) + ' ÷ 12) × ' + meses + ' avos − 1ª parcela (' + fmt(primeiraPaga) + ')', isento: false });
        if (descontar) {
          var inssSeg = calcularINSS(integral);
          var irrfSeg = calcularIRRF(integral - inssSeg);
          if (inssSeg > 0) descontos.push({ label: 'INSS sobre 13º integral', valor: inssSeg, formula: 'Tabela INSS sobre ' + fmt(integral) + ' (cálculo isolado)' });
          if (irrfSeg > 0) descontos.push({ label: 'IRRF sobre 13º integral', valor: irrfSeg, formula: 'Tabela IRRF sobre ' + fmt(integral - inssSeg) });
        }
      } else {
        creditos.push({ label: '13º Salário Integral (' + meses + '/12 avos)', valor: integral, formula: '(' + fmt(salario) + ' ÷ 12) × ' + meses + ' avos', isento: false });
        if (descontar) {
          var inss = calcularINSS(integral);
          var irrf = calcularIRRF(integral - inss);
          if (inss > 0) descontos.push({ label: 'INSS sobre 13º', valor: inss, formula: 'Tabela INSS sobre ' + fmt(integral) });
          if (irrf > 0) descontos.push({ label: 'IRRF sobre 13º', valor: irrf, formula: 'Tabela IRRF sobre ' + fmt(integral - inss) });
        }
      }

      renderResultado('result-decimo', { creditos: creditos, descontos: descontos, avisos: avisos });
    });
  }

  /* ====================================================================
     10. FGTS (calculadora independente)
     ==================================================================== */

  function setupFgtsForm() {
    el('form-fgts').addEventListener('submit', function (e) {
      e.preventDefault();
      var formEl = e.target;
      limparErros(formEl);

      var salario = readNumber('fgts-salario');
      var admissao = readDate('fgts-admissao');
      var referencia = readDate('fgts-referencia');
      var tipoSaida = readSelect('fgts-tipo-saida');

      var erros = [];
      if (isNaN(salario) || salario <= 0) erros.push({ id: 'fgts-salario', msg: 'Informe um salário válido.' });
      if (!admissao) erros.push({ id: 'fgts-admissao', msg: 'Informe a data de admissão.' });
      if (!referencia) erros.push({ id: 'fgts-referencia', msg: 'Informe a data de referência.' });
      if (admissao && referencia && referencia < admissao) erros.push({ id: 'fgts-referencia', msg: 'A data de referência não pode ser anterior à admissão.' });
      if (erros.length) {
        erros.forEach(function (er) { marcarErro(el(er.id), er.msg); });
        return;
      }

      var meses = mesesProporcionais(admissao, referencia) || mesesCompletos(admissao, referencia);
      if (meses <= 0) meses = Math.max(1, Math.round(diffDays(admissao, referencia) / 30));

      var totalDepositado = salario * 0.08 * meses;
      var creditos = [
        { label: 'Depósito Mensal de FGTS', valor: salario * 0.08, formula: fmt(salario) + ' × 8%', isento: true, informativo: true },
        { label: 'Total Depositado no Período (' + meses + ' meses)', valor: totalDepositado, formula: fmt(salario * 0.08) + ' × ' + meses + ' meses', isento: true }
      ];

      var avisos = ['Este valor é uma estimativa simplificada (8% sobre o salário informado, mês a mês). O extrato oficial da Caixa Econômica considera também FGTS sobre 13º, férias, horas extras e correção monetária (TR + juros).'];

      var percentualMulta = 0;
      if (tipoSaida === 'sem_justa') percentualMulta = 0.4;
      else if (tipoSaida === 'acordo') percentualMulta = 0.2;

      if (percentualMulta > 0) {
        var multa = totalDepositado * percentualMulta;
        creditos.push({
          label: 'Multa Rescisória (' + (percentualMulta * 100) + '%)',
          valor: multa,
          formula: fmt(totalDepositado) + ' × ' + (percentualMulta * 100) + '%',
          isento: true
        });
      } else if (tipoSaida === 'pedido' || tipoSaida === 'justa_causa') {
        avisos.push('Neste tipo de saída não há multa rescisória sobre o FGTS, e o saque do saldo costuma ficar bloqueado, salvo hipóteses legais específicas (ex.: aposentadoria, doença grave).');
      }

      renderResultado('result-fgts', { creditos: creditos, avisos: avisos });
    });
  }

  /* ====================================================================
     11. ACORDO TRABALHISTA (simulação de parcelamento/negociação)
     ==================================================================== */

  function setupAcordoForm() {
    el('form-acordo').addEventListener('submit', function (e) {
      e.preventDefault();
      var formEl = e.target;
      limparErros(formEl);

      var valor = readNumber('aco-valor');
      var desc = readNumber('aco-desconto') / 100;
      var parcelas = readInt('aco-parcelas');

      var erros = [];
      if (isNaN(valor) || valor <= 0) erros.push({ id: 'aco-valor', msg: 'Informe o valor total das verbas.' });
      if (isNaN(desc) || desc < 0 || desc > 1) erros.push({ id: 'aco-desconto', msg: 'Informe um desconto entre 0% e 100%.' });
      if (isNaN(parcelas) || parcelas < 1) erros.push({ id: 'aco-parcelas', msg: 'Informe ao menos 1 parcela.' });
      if (erros.length) {
        erros.forEach(function (er) { marcarErro(el(er.id), er.msg); });
        return;
      }

      var descontoValor = valor * desc;
      var valorFinal = valor * (1 - desc);
      var valorParcela = valorFinal / parcelas;

      renderResultado('result-acordo', {
        creditos: [
          { label: 'Valor Original das Verbas', valor: valor, formula: 'Valor informado', isento: true, informativo: true },
          { label: 'Valor do Acordo (após desconto)', valor: valorFinal, formula: fmt(valor) + ' × (1 − ' + (desc * 100) + '%)', isento: true },
          { label: 'Valor por Parcela (' + parcelas + 'x)', valor: valorParcela, formula: fmt(valorFinal) + ' ÷ ' + parcelas, isento: true, informativo: true }
        ],
        descontos: [
          { label: 'Desconto Negociado (' + (desc * 100) + '%)', valor: descontoValor, formula: fmt(valor) + ' × ' + (desc * 100) + '%', informativo: true }
        ],
        avisos: ['Acordos extrajudiciais ou judiciais para pagamento parcelado das verbas rescisórias devem ser formalizados por escrito (e, se em juízo, homologados) para terem segurança jurídica.']
      });
    });
  }

  /* ====================================================================
     12. INICIALIZAÇÃO
     ==================================================================== */

  document.addEventListener('DOMContentLoaded', function () {
    setupTabs();
    setupRescisaoForm();
    setupExtrasForm();
    setupFeriasForm();
    setupDecimoForm();
    setupFgtsForm();
    setupAcordoForm();
  });

})();
