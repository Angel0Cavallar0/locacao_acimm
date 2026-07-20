-- Migration 0038 — Configurações base do contrato (Spec 13 §1)
-- Reutiliza `responsavel_nome` (0029) como responsável/signatário — sem coluna
-- nova. Semeia: modo de envio, textos jurídicos (extraídos do modelo real da
-- ACIMM em docs/referencias/) e os dados bancários exibidos no contrato.

insert into configuracoes (chave, valor, descricao) values
('modo_envio_contrato', '"email"',
 'Como o contrato é enviado ao locatário após a aprovação: "email" (PDF por e-mail) ou "autentique" (assinatura digital via API)'),
('dados_pagamento',
 '{"banco":"SICREDI","codigo_banco":"748","agencia":"0718","conta":"91717-2","pix":""}',
 'Dados bancários exibidos no contrato e nas instruções de pagamento'),
('contrato_textos',
 '{
   "locadora": "ASSOCIAÇÃO COMERCIAL E INDUSTRIAL DE MOGI MIRIM – ACIMM, CNPJ 44.793.255/0001-24, Av. Luiz Gonzaga de Amoedo Campos, 500, Mogi Mirim/SP.",
   "clausulas": [
     {"titulo": "Direito de Uso", "texto": "É direito do associado ou filiado, desde que regular, requerer parte do edifício sede para reuniões, palestras e aulas."},
     {"titulo": "Vedações", "texto": "Expressamente vedada a locação para eventos com lucro financeiro como objetivo exclusivo, destituído de finalidade social/beneficente."},
     {"titulo": "Tolerância", "texto": "O uso dos espaços possui uma tolerância de 20 minutos; ultrapassado esse período, será cobrada a hora adicional."},
     {"titulo": "Materiais Promocionais", "texto": "Fixação de materiais apenas em locais pré-determinados pela ACIMM."},
     {"titulo": "Serviços Terceirizados", "texto": "Comunicação com 5 dias de antecedência; a ACIMM não se responsabiliza pelo serviço ou utensílios."},
     {"titulo": "Danos", "texto": "Qualquer dano ao imóvel ou mobiliário é de responsabilidade do locatário (ressarcimento em 3 dias). Parágrafo único: A ACIMM não se responsabiliza por perdas, furtos ou danos a objetos pessoais."},
     {"titulo": "Capacidade", "texto": "O locatário deve respeitar a capacidade máxima de cada ambiente."},
     {"titulo": "LGPD", "texto": "O associado consente com o uso de dados para finalidades administrativas da ACIMM."}
   ],
   "consideracoes_finais": [
     "É proibido o uso do logotipo da ACIMM sem autorização prévia do departamento de marketing.",
     "Em caso de locação do auditório, é necessário trazer colaborador técnico para operação de som/slides."
   ],
   "termo_responsabilidade": "Declaro estar ciente e de acordo com as condições estabelecidas para a locação e uso dos espaços da ACIMM."
 }',
 'Textos jurídicos do contrato (refletem nos próximos contratos gerados)')
on conflict (chave) do nothing;
