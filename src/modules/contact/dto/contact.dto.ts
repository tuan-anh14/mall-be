import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateContactDto {
  @IsNotEmpty({ message: 'Tên không được để trống' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsNotEmpty({ message: 'Chủ đề không được để trống' })
  @IsString()
  @MinLength(5, { message: 'Chủ đề phải có ít nhất 5 ký tự' })
  subject: string;

  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  @IsString()
  @MinLength(10, { message: 'Nội dung phải có ít nhất 10 ký tự' })
  message: string;
}

export class ReplyContactDto {
  @IsNotEmpty({ message: 'Nội dung phản hồi không được để trống' })
  @IsString()
  replyText: string;

  @IsOptional()
  @IsString({ each: true })
  attachments?: string[]; // Array of image URLs
}
