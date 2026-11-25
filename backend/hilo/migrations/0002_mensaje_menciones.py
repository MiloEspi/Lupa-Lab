from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cuentas', '0001_initial'),
        ('hilo', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='mensaje',
            name='menciones',
            field=models.ManyToManyField(blank=True, related_name='+', to='cuentas.membresia'),
        ),
    ]
