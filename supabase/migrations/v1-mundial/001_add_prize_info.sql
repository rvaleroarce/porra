-- Añade el campo de descripción del premio a cada porra
alter table porras add column if not exists prize_info text;
