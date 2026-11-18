-- Endesha BAADA ya kujisajili kwenye tovuti kwa namba ya admin (badilisha namba kama inahitajika)
insert into admins select id from auth.users where email='255771641624@medico.tz';
