import { Body, Controller, Post } from '@nestjs/common';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';

@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Post()
  async create(@Body() dto: CreateFormDto) {
    const form = await this.formsService.createForm(dto);
    return { message: 'Formulário criado com sucesso', form };
  }
}
