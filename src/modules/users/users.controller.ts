import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /users
   * Admin creates any role; Doctor can create PATIENT only.
   * Sends invite email with temporary password.
   */
  @Post()
  @Roles('ADMIN', 'DOCTOR')
  adminCreateUser(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.usersService.adminCreateUser(createUserDto, currentUser.role);
  }

  @Get()
  @Roles('ADMIN')
  findAll(@Query('role') role?: UserRole) {
    return this.usersService.findAll(role);
  }

  @Get('doctors')
  findDoctors(@Query('specialization') specialization?: string) {
    return this.usersService.findDoctors(specialization);
  }

  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Get('stats')
  getStats(@CurrentUser() user: any) {
    return this.usersService.getStats(user.id, user.role);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, updateUserDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.usersService.remove(id, user.role);
  }
}